import type { Game } from './game';
import { Creatures, EMPTY, getSpellLevel, getSpellLevelByCode, Spells, Towns } from './constants';
import { getInt, getUint16, getUint32, writeInt32, writeUint16 } from './bytes';
import {
  buildingAbsBit,
  buildingDef,
  guildSpellCapForLevel,
  guildSpellCapacity,
  TOWN_ARMY_SLOTS,
  TOWN_BIT,
  TOWN_BUILDINGS_BYTES,
  TOWN_BUILDINGS_OFFSET,
  TOWN_BUILDING_DEFS,
  TOWN_GARRISON_COUNT_OFFSET,
  TOWN_GARRISON_COUNT_OFFSET_HOTA,
  TOWN_GARRISON_SLOT_SIZE,
  TOWN_GARRISON_TYPE_OFFSET,
  TOWN_GARRISON_TYPE_OFFSET_HOTA,
  TOWN_GROWTH_SLOTS,
  TOWN_GUILD_SLOT_CAPS,
  TOWN_LIBRARY_BUILDING,
  TOWN_MAGE_GUILD_BUILDINGS,
  TOWN_MAX_SPELLS,
  TOWN_META_OWNER_OFFSET,
  TOWN_META_TYPE_OFFSET,
  TOWN_NAME_LEN_OFFSET,
  TOWN_NAME_OFFSET,
  TOWN_OWNER_OFFSET_HOTA,
  TOWN_RECORD_SIZE,
  TOWN_RECORD_SIZE_HOTA,
  resolveTownFaction,
  type BuildingChain,
  type TownBuildingDef,
} from './town-constants';
import { isHotATownLayout, readTownName } from './town-scan';

const SPELL_SENTINEL = new TextEncoder().encode('AVWu');
const ON = 0x00;
/**
 * HotA 1.8.0 and earlier: 4 building bytes after guild slot counts, then a spell-presence
 * dword. Dwelling bits live in 14 growth flags before the guild slots.
 * HotA 1.8.1 (version minor >= 11): those 6 bytes are the full building mask, including
 * dwellings. The following dword is not spell-presence, and the old growth window is unrelated.
 */
const HOTA_BUILDINGS_BYTES = 4;
const HOTA_BUILDINGS_BYTES_WIDE = 6;

export class Town {
  readonly bytePosition: number;
  readonly name: string;
  readonly faction: string;
  readonly factionLang: string;
  readonly typeId: number;
  readonly isHotA: boolean;
  owner: number;
  creatures: (string | null)[] = Array(TOWN_ARMY_SLOTS).fill(null);
  creatureAmounts = new Int32Array(TOWN_ARMY_SLOTS);
  buildings = new Uint8Array(TOWN_BUILDINGS_BYTES);
  /** Spell ids; may include 0 empty guild slots when `fixedSpellSlots` is set. */
  spells: number[] = [];
  private spellStart = -1;
  private fixedSpellSlots = 0;
  private guildSlotOffset = -1;
  private buildingsOffset = TOWN_BUILDINGS_OFFSET;
  /** How many building-mask bytes may be written back to the save (0 = in-memory only). */
  private buildingsWritableBytes = TOWN_BUILDINGS_BYTES;
  /** Relative offset of 14×uint32 dwelling growth flags, or -1. */
  private growthOffset = -1;
  private garrisonTypeOffset = TOWN_GARRISON_TYPE_OFFSET;
  private garrisonCountOffset = TOWN_GARRISON_COUNT_OFFSET;

  game: Game;

  constructor(game: Game, bytePosition: number) {
    this.game = game;
    this.bytePosition = bytePosition;
    this.name = readTownName(game.bytes, bytePosition);
    this.isHotA = isHotATownLayout(game.bytes, bytePosition);

    const recordEnd = bytePosition + (this.isHotA ? TOWN_RECORD_SIZE_HOTA : TOWN_RECORD_SIZE);
    // Both HotA and Complete/SoD store mage-guild slot counts (5,4,3,2,1); empty slots are zero.
    const guild = findGuildSpellSlots(game.bytes, bytePosition, recordEnd);

    if (this.isHotA) {
      this.garrisonTypeOffset = TOWN_GARRISON_TYPE_OFFSET_HOTA;
      this.garrisonCountOffset = TOWN_GARRISON_COUNT_OFFSET_HOTA;
      this.owner = game.bytes[bytePosition + TOWN_OWNER_OFFSET_HOTA];
      this.typeId = 0;
      const located = locateHotABuildings(
        game.bytes,
        bytePosition,
        guild,
        game.version.major >= 44 && game.version.minor >= 11,
      );
      this.buildingsOffset = located.offset;
      this.buildingsWritableBytes = located.writableBytes;
      this.growthOffset = located.growthOffset;
      this.buildings.set(located.buildings);
    } else {
      const meta = this.metaOffset(game.bytes);
      this.typeId = getUint16(game.bytes, meta + TOWN_META_TYPE_OFFSET);
      this.owner = getUint16(game.bytes, meta + TOWN_META_OWNER_OFFSET);
      this.buildings.set(game.bytes.subarray(
        bytePosition + this.buildingsOffset,
        bytePosition + this.buildingsOffset + TOWN_BUILDINGS_BYTES,
      ));
    }

    this.faction = resolveTownFaction(this.typeId, this.name, (town) => Towns.factionForTown(town));
    this.factionLang = Towns.getLangFactionValue(this.faction);

    for (let i = 0; i < TOWN_ARMY_SLOTS; i++) {
      const typeOff = bytePosition + this.garrisonTypeOffset + i * TOWN_GARRISON_SLOT_SIZE;
      const countOff = bytePosition + this.garrisonCountOffset + i * TOWN_GARRISON_SLOT_SIZE;
      const code = readCreatureTypeCode(game.bytes, typeOff);
      if (code != null) {
        try {
          this.creatures[i] = Creatures.getByCode(code);
          this.creatureAmounts[i] = readCreatureCount(game.bytes, countOff, this.isHotA);
        } catch {
          this.creatures[i] = null;
          this.creatureAmounts[i] = 0;
        }
      }
    }

    if (guild) {
      this.guildSlotOffset = bytePosition + guild.offset;
    }

    this.spellStart = findSpellStart(game.bytes, bytePosition, recordEnd, guild);
    if (this.spellStart >= 0) {
      const av = indexOfWithin(game.bytes, SPELL_SENTINEL, this.spellStart, recordEnd);
      if (av >= 0) {
        // Classic Complete/SoD: spell blob runs until AVWu and may contain empty (zero) slots.
        this.fixedSpellSlots = Math.min(TOWN_MAX_SPELLS, Math.floor((av - this.spellStart) / 4));
      } else {
        // HotA: no AVWu sentinel; slot count comes from mage-guild capacity bytes.
        this.fixedSpellSlots = guild?.capacity ?? 0;
      }
      this.spells = readSpellIds(game.bytes, this.spellStart, recordEnd, this.fixedSpellSlots);
    }
  }

  private metaOffset(bytes: Uint8Array): number {
    const len = getUint16(bytes, this.bytePosition + TOWN_NAME_LEN_OFFSET);
    return this.bytePosition + TOWN_NAME_OFFSET + len;
  }

  updateOwner(player: number): void {
    const owner = Math.max(0, Math.min(255, Math.floor(player)));
    this.owner = owner;
    const listed = this.game.towns.find((town) => town.bytePosition === this.bytePosition);
    if (listed) listed.owner = owner;
    if (this.isHotA) {
      this.game.bytes[this.bytePosition + TOWN_OWNER_OFFSET_HOTA] = owner;
      return;
    }
    const meta = this.metaOffset(this.game.bytes);
    writeUint16(this.game.bytes, meta + TOWN_META_OWNER_OFFSET, owner);
  }

  updateCreature(slot: number, creature: string | null, amount: number): void {
    if (slot < 0 || slot >= TOWN_ARMY_SLOTS) return;
    const typeOff = this.bytePosition + this.garrisonTypeOffset + slot * TOWN_GARRISON_SLOT_SIZE;
    const countOff = this.bytePosition + this.garrisonCountOffset + slot * TOWN_GARRISON_SLOT_SIZE;
    if (!creature) {
      this.creatures[slot] = null;
      this.creatureAmounts[slot] = 0;
      for (let j = 0; j < 4; j++) this.game.bytes[typeOff + j] = EMPTY;
      writeCreatureCount(this.game.bytes, countOff, 0, this.isHotA);
      return;
    }
    const code = Creatures.getCode(creature);
    this.creatures[slot] = creature;
    this.creatureAmounts[slot] = amount;
    writeCreatureTypeCode(this.game.bytes, typeOff, code, this.isHotA);
    writeCreatureCount(this.game.bytes, countOff, amount, this.isHotA);
  }

  isBuildingBuilt(def: TownBuildingDef): boolean {
    const byte = this.buildings[def.byte] ?? 0;
    return ((byte >> def.bit) & 1) === 1;
  }

  setBuildingBuilt(def: TownBuildingDef, built: boolean): void {
    this.writeBuildingBit(def, built);
    if (this.buildingAffectsGuild(def)) this.syncGuildSpellLayout();
  }

  /** Highest built step in a progressive chain (0 = none / village hall). */
  getBuildingChainLevel(chain: BuildingChain): number {
    let level = 0;
    for (let i = 0; i < chain.steps.length; i++) {
      if (this.isBuildingBuilt(chain.steps[i])) level = i + 1;
    }
    return level;
  }

  /** Set a progressive chain to `level`, including all prerequisites and clearing higher tiers. */
  setBuildingChainLevel(chain: BuildingChain, level: number): void {
    const target = Math.max(0, Math.min(chain.steps.length, Math.floor(level)));
    let affectsGuild = false;
    for (let i = 0; i < chain.steps.length; i++) {
      this.writeBuildingBit(chain.steps[i], i < target);
      if (this.buildingAffectsGuild(chain.steps[i])) affectsGuild = true;
    }
    if (affectsGuild) this.syncGuildSpellLayout();
  }

  private writeBuildingBit(def: TownBuildingDef, built: boolean): void {
    const absBit = buildingAbsBit(def);
    const isDwelling = absBit >= TOWN_BIT.DWELL_1 && absBit <= TOWN_BIT.DWELL_7B_UP;

    let byte = this.buildings[def.byte] ?? 0;
    if (built) byte |= 1 << def.bit;
    else byte &= ~(1 << def.bit);
    this.buildings[def.byte] = byte;

    // 1.8.0 stores dwellings in growth flags, so those bits stay out of the 4-byte mask.
    // 1.8.1 stores them in the 6-byte mask (growthOffset < 0).
    const persistInMask = def.byte < this.buildingsWritableBytes
      && !(isDwelling && this.growthOffset >= 0);
    if (persistInMask) {
      this.game.bytes[this.bytePosition + this.buildingsOffset + def.byte] = byte;
    }

    if (this.growthOffset >= 0 && isDwelling) {
      if (this.faction === 'Factory' && isFactoryLevel7Bit(absBit)) {
        this.syncFactoryLevel7Growth();
        return;
      }
      const growthIndex = growthIndexForDwellingBit(absBit);
      if (growthIndex < 0) return;
      writeInt32(
        this.game.bytes,
        this.bytePosition + this.growthOffset + growthIndex * 4,
        built ? 1 : 0,
      );
    }
  }

  /**
   * Factory leaves standard L7 growth slots cleared when both dual L7 lines are present.
   * Persist Serpentarium / Gantry by writing those slots inverted (0 = built).
   */
  private syncFactoryLevel7Growth(): void {
    const serp = this.isBuildingBuilt(buildingDef('Serpentarium', TOWN_BIT.DWELL_1 + 6))
      || this.isBuildingBuilt(buildingDef('Serpentarium (Upg)', TOWN_BIT.DWELL_1_UP + 6));
    const gantry = this.isBuildingBuilt(buildingDef('Gantry', TOWN_BIT.DWELL_7B))
      || this.isBuildingBuilt(buildingDef('Gantry (Upg)', TOWN_BIT.DWELL_7B_UP));
    writeInt32(this.game.bytes, this.bytePosition + this.growthOffset + 6 * 4, serp ? 0 : 1);
    writeInt32(this.game.bytes, this.bytePosition + this.growthOffset + 13 * 4, gantry ? 0 : 1);
  }

  private buildingAffectsGuild(def: TownBuildingDef): boolean {
    return (def.byte === TOWN_LIBRARY_BUILDING.byte && def.bit === TOWN_LIBRARY_BUILDING.bit)
      || TOWN_MAGE_GUILD_BUILDINGS.some((mg) => mg.byte === def.byte && mg.bit === def.bit);
  }

  /** Tower Library grants +1 spell slot per mage-guild level. */
  hasLibrary(): boolean {
    return this.faction === 'Tower' && this.isBuildingBuilt(TOWN_LIBRARY_BUILDING);
  }

  /** Highest mage guild level currently built (0 if none). */
  mageGuildLevel(): number {
    let fromBuildings = 0;
    for (let i = 0; i < TOWN_MAGE_GUILD_BUILDINGS.length; i++) {
      if (this.isBuildingBuilt(TOWN_MAGE_GUILD_BUILDINGS[i])) fromBuildings = i + 1;
    }
    let fromSlots = 0;
    if (this.guildSlotOffset >= 0) {
      for (let i = 0; i < 5; i++) {
        if (this.game.bytes[this.guildSlotOffset + i] > 0) fromSlots = i + 1;
      }
    }
    let fromSpells = 0;
    for (const code of this.spells) {
      if (code > 0) fromSpells = Math.max(fromSpells, getSpellLevelByCode(code));
    }
    return Math.max(fromBuildings, fromSlots, fromSpells);
  }

  /** Max selectable spells for a spell level, given guild + Library rules. */
  spellCapForLevel(level: number): number {
    if (level < 1 || level > 5) return 0;
    if (this.mageGuildLevel() < level) return 0;
    return guildSpellCapForLevel(level, this.hasLibrary());
  }

  spellsAtLevel(level: number): string[] {
    return this.spellNames().filter((name) => getSpellLevel(name) === level);
  }

  canAddSpell(spellName: string): boolean {
    if (this.hasSpell(spellName)) return false;
    const level = getSpellLevel(spellName);
    return this.spellsAtLevel(level).length < this.spellCapForLevel(level);
  }

  setSpellAt(index: number, spellCode: number): void {
    if (this.spellStart < 0) return;
    const off = this.spellStart + index * 4;
    writeInt32(this.game.bytes, off, spellCode);
    this.spells[index] = spellCode;
  }

  addSpell(spellName: string): void {
    if (this.spellStart < 0) return;
    if (!this.canAddSpell(spellName)) return;
    const code = Spells.getCode(spellName);
    const level = getSpellLevel(spellName);

    if (this.fixedSpellSlots > 0) {
      // HotA stores spells in per-level bands; classic AVWu blobs are unordered.
      const empty = this.isHotA
        ? this.emptySlotForLevel(level)
        : this.spells.findIndex((c) => c === 0);
      if (empty === -1) return;
      this.setSpellAt(empty, code);
      return;
    }

    if (this.spells.length >= TOWN_MAX_SPELLS) return;
    const off = this.spellStart + this.spells.length * 4;
    writeInt32(this.game.bytes, off, code);
    this.spells.push(code);
  }

  removeSpellAt(index: number): void {
    if (this.spellStart < 0 || index < 0 || index >= this.spells.length) return;

    if (this.fixedSpellSlots > 0) {
      this.setSpellAt(index, 0);
      return;
    }

    this.spells.splice(index, 1);
    for (let i = 0; i < TOWN_MAX_SPELLS; i++) {
      const code = i < this.spells.length ? this.spells[i] : 0;
      writeInt32(this.game.bytes, this.spellStart + i * 4, code);
    }
  }

  spellNames(): string[] {
    return this.spells.filter((code) => code > 0).map((code) => Spells.getByCode(code));
  }

  hasSpell(spellName: string): boolean {
    return this.spells.includes(Spells.getCode(spellName));
  }

  setSpellKnown(spellName: string, known: boolean): void {
    const code = Spells.getCode(spellName);
    const index = this.spells.indexOf(code);
    if (known && index === -1) {
      this.addSpell(spellName);
    } else if (!known && index !== -1) {
      this.removeSpellAt(index);
    }
  }

  /** Rebuild per-level slot layout after Library / mage-guild building changes. */
  private syncGuildSpellLayout(): void {
    const maxLevel = this.mageGuildLevel();
    const hasLibrary = this.hasLibrary();
    const caps = [1, 2, 3, 4, 5].map((level) => (
      level <= maxLevel ? guildSpellCapForLevel(level, hasLibrary) : 0
    ));

    if (this.guildSlotOffset >= 0) {
      for (let i = 0; i < 5; i++) {
        this.game.bytes[this.guildSlotOffset + i] = caps[i];
      }
    }

    if (this.spellStart < 0) return;

    const byLevel: number[][] = [[], [], [], [], []];
    for (const code of this.spells) {
      if (code <= 0) continue;
      const level = getSpellLevelByCode(code);
      if (level < 1 || level > 5) continue;
      if (byLevel[level - 1].length < caps[level - 1]) {
        byLevel[level - 1].push(code);
      }
    }

    const next: number[] = [];
    for (let level = 0; level < 5; level++) {
      const spells = byLevel[level];
      for (let i = 0; i < caps[level]; i++) {
        next.push(spells[i] ?? 0);
      }
    }

    const writeCount = Math.max(this.fixedSpellSlots, next.length, guildSpellCapacity(maxLevel, hasLibrary));
    for (let i = 0; i < writeCount; i++) {
      const code = i < next.length ? next[i] : 0;
      writeInt32(this.game.bytes, this.spellStart + i * 4, code);
    }
    this.spells = next;
    this.fixedSpellSlots = next.length;
  }

  private emptySlotForLevel(level: number): number {
    const { start, count } = this.levelSlotRange(level);
    for (let i = 0; i < count; i++) {
      if ((this.spells[start + i] ?? 0) === 0) return start + i;
    }
    return -1;
  }

  private levelSlotRange(level: number): { start: number; count: number } {
    const hasLibrary = this.hasLibrary();
    let start = 0;
    for (let l = 1; l < level; l++) {
      start += guildSpellCapForLevel(l, hasLibrary);
    }
    return { start, count: guildSpellCapForLevel(level, hasLibrary) };
  }
}

export interface GuildSpellSlots {
  offset: number;
  level: number;
  capacity: number;
  slots: number[];
}

/** HotA towns store mage-guild slot counts as 5..1, or 6..2 when Library is present. */
export function findGuildSpellSlots(
  bytes: Uint8Array,
  recordStart: number,
  recordEnd: number,
): GuildSpellSlots | null {
  const hi = Math.min(recordEnd, recordStart + 0xc0) - 5;
  for (let off = recordStart + 0xa0; off <= hi; off++) {
    const first = bytes[off];
    if (first !== TOWN_GUILD_SLOT_CAPS[0] && first !== TOWN_GUILD_SLOT_CAPS[0] + 1) continue;
    const slots: number[] = [];
    let ok = true;
    for (let i = 0; i < 5; i++) {
      const v = bytes[off + i];
      const base = TOWN_GUILD_SLOT_CAPS[i];
      if (v !== 0 && v !== base && v !== base + 1) {
        ok = false;
        break;
      }
      slots.push(v);
    }
    if (!ok) continue;
    let level = 0;
    let capacity = 0;
    for (let i = 0; i < 5; i++) {
      if (slots[i] > 0) {
        level = i + 1;
        capacity += slots[i];
      }
    }
    if (level === 0) continue;
    return { offset: off - recordStart, level, capacity, slots };
  }
  return null;
}

export interface HotABuildingsLocation {
  /** Relative offset of the 4-byte building mask (guild slots + 5). */
  offset: number;
  /** Bytes safe to write back; 0 when the mask looks like a pointer/junk. */
  writableBytes: number;
  /** Relative offset of 14×uint32 growth flags, or -1. */
  growthOffset: number;
  /** Full 6-byte logical mask (dwellings may be filled from growth). */
  buildings: Uint8Array;
}

/**
 * HotA building bits sit immediately after mage-guild slot counts (VCMI BuildingID order).
 * 1.8.0: 4-byte mask, then a spell-presence dword (`xx 0N 00 00`, N in 0x0b–0x0f).
 * Dwelling bits come from 14 growth flags immediately before the guild slots.
 * 1.8.1 (`wideMask`): 6-byte mask already includes dwellings. Growth flags are not used.
 */
export function locateHotABuildings(
  bytes: Uint8Array,
  recordStart: number,
  guild: GuildSpellSlots | null,
  wideMask = false,
): HotABuildingsLocation {
  const buildings = new Uint8Array(TOWN_BUILDINGS_BYTES);
  if (!guild) {
    return { offset: TOWN_BUILDINGS_OFFSET, writableBytes: 0, growthOffset: -1, buildings };
  }

  const offset = guild.offset + 5;
  const growthOffset = guild.offset - TOWN_GROWTH_SLOTS * 4;
  const abs = recordStart + offset;

  if (wideMask) {
    if (abs + HOTA_BUILDINGS_BYTES_WIDE > bytes.length) {
      return synthesizeHotABuildings(guild.level, -1);
    }
    const mask = bytes.subarray(abs, abs + HOTA_BUILDINGS_BYTES_WIDE);
    if (!isPlausibleWideHotABuildingMask(mask, guild.level)) {
      return synthesizeHotABuildings(guild.level, -1);
    }
    buildings.set(mask);
    return {
      offset,
      writableBytes: HOTA_BUILDINGS_BYTES_WIDE,
      growthOffset: -1,
      buildings,
    };
  }

  if (abs + HOTA_BUILDINGS_BYTES + 4 > bytes.length || growthOffset < 0) {
    return synthesizeHotABuildings(guild.level, -1);
  }

  const mask = bytes.subarray(abs, abs + HOTA_BUILDINGS_BYTES);
  const next = bytes.subarray(abs + HOTA_BUILDINGS_BYTES, abs + HOTA_BUILDINGS_BYTES + 4);
  const plausible = isPlausibleHotABuildingMask(mask, next, guild.level);

  if (plausible) {
    buildings.set(mask);
  } else {
    setMageGuildBits(buildings, guild.level);
  }

  applyGrowthDwellings(bytes, recordStart + growthOffset, buildings);

  return {
    offset,
    writableBytes: plausible ? HOTA_BUILDINGS_BYTES : 0,
    growthOffset,
    buildings,
  };
}

function synthesizeHotABuildings(guildLevel: number, growthOffset: number): HotABuildingsLocation {
  const buildings = new Uint8Array(TOWN_BUILDINGS_BYTES);
  setMageGuildBits(buildings, guildLevel);
  return {
    offset: TOWN_BUILDINGS_OFFSET,
    writableBytes: 0,
    growthOffset,
    buildings,
  };
}

/** 1.8.1 mask: mage-guild bits agree with slot counts. Bits 44–47 hold Factory's second level-7 line and Cove's Frigate second upgrade. */
function isPlausibleWideHotABuildingMask(mask: Uint8Array, guildLevel: number): boolean {
  if (maxMageGuildLevel(mask) !== guildLevel) return false;
  let built = 0;
  for (let i = 0; i < HOTA_BUILDINGS_BYTES_WIDE * 8; i++) {
    if (buildingBit(mask, i)) built += 1;
  }
  return built >= 1 && built <= 40;
}

/** Spell-presence dword after the 1.8.0 building mask: `xx 0N 00 00` with N in 0x0b–0x0f. */
function isPlausibleHotABuildingMask(
  mask: Uint8Array,
  next: Uint8Array,
  guildLevel: number,
): boolean {
  if (next[2] !== 0 || next[3] !== 0) return false;
  if (next[1] < 0x0b || next[1] > 0x0f) return false;
  if (maxMageGuildLevel(mask) !== guildLevel) return false;
  let built = 0;
  for (let i = 0; i < HOTA_BUILDINGS_BYTES * 8; i++) {
    if (buildingBit(mask, i)) built += 1;
  }
  return built >= 1 && built <= 24;
}

function setMageGuildBits(mask: Uint8Array, guildLevel: number): void {
  for (let level = 1; level <= Math.min(5, guildLevel); level++) {
    const bit = TOWN_BIT.MG1 + level - 1;
    mask[bit >> 3] |= 1 << (bit & 7);
  }
}

function applyGrowthDwellings(bytes: Uint8Array, growthAbs: number, buildings: Uint8Array): void {
  if (growthAbs < 0 || growthAbs + TOWN_GROWTH_SLOTS * 4 > bytes.length) return;
  const flags: number[] = [];
  for (let i = 0; i < TOWN_GROWTH_SLOTS; i++) {
    const value = getUint32(bytes, growthAbs + i * 4);
    if (value > 1) return; // not a 0/1 built flag table
    flags.push(value);
  }

  // Tiers 1–6 always use the normal growth flags.
  for (let i = 0; i < 6; i++) {
    if (flags[i] === 1) setAbsBit(buildings, TOWN_BIT.DWELL_1 + i);
    if (flags[i + 7] === 1) setAbsBit(buildings, TOWN_BIT.DWELL_1_UP + i);
  }

  // Factory dual L7: with dwellings 1–6 complete, cleared L7 growth slots mean both
  // Serpentarium and Gantry are present (HotA does not use the single L7 slot pair).
  if (isFactoryDualLevel7Growth(flags)) {
    setAbsBit(buildings, TOWN_BIT.DWELL_1 + 6);
    setAbsBit(buildings, TOWN_BIT.DWELL_1_UP + 6);
    setAbsBit(buildings, TOWN_BIT.DWELL_7B);
    setAbsBit(buildings, TOWN_BIT.DWELL_7B_UP);
    return;
  }

  // Standard single L7 line (non-Factory, or Factory with only one track).
  if (flags[6] === 1) setAbsBit(buildings, TOWN_BIT.DWELL_1 + 6);
  if (flags[13] === 1) setAbsBit(buildings, TOWN_BIT.DWELL_1_UP + 6);
}

/** HotA Factory pattern: tiers 1–6 fully upgraded, standard L7 growth slots left clear. */
function isFactoryDualLevel7Growth(flags: number[]): boolean {
  for (let i = 0; i < 6; i++) {
    if (flags[i] !== 1 || flags[i + 7] !== 1) return false;
  }
  return flags[6] === 0 && flags[13] === 0;
}

function setAbsBit(mask: Uint8Array, absBit: number): void {
  mask[absBit >> 3] |= 1 << (absBit & 7);
}

function isFactoryLevel7Bit(absBit: number): boolean {
  return absBit === TOWN_BIT.DWELL_1 + 6
    || absBit === TOWN_BIT.DWELL_1_UP + 6
    || absBit === TOWN_BIT.DWELL_7B
    || absBit === TOWN_BIT.DWELL_7B_UP;
}

function growthIndexForDwellingBit(absBit: number): number {
  if (absBit >= TOWN_BIT.DWELL_1 && absBit <= TOWN_BIT.DWELL_1 + 6) {
    return absBit - TOWN_BIT.DWELL_1;
  }
  if (absBit >= TOWN_BIT.DWELL_1_UP && absBit <= TOWN_BIT.DWELL_1_UP + 6) {
    return absBit - TOWN_BIT.DWELL_1_UP + 7;
  }
  return -1;
}

function buildingBit(mask: Uint8Array, bit: number): boolean {
  const byte = mask[bit >> 3] ?? 0;
  return ((byte >> (bit & 7)) & 1) === 1;
}

function maxMageGuildLevel(mask: Uint8Array): number {
  let level = 0;
  for (let l = 1; l <= 5; l++) {
    if (buildingBit(mask, TOWN_BIT.MG1 + l - 1)) level = l;
  }
  return level;
}

function readCreatureTypeCode(bytes: Uint8Array, typeOff: number): number | null {
  const b0 = bytes[typeOff];
  const b1 = bytes[typeOff + 1];
  const b2 = bytes[typeOff + 2];
  const b3 = bytes[typeOff + 3];
  if (b0 === EMPTY && b1 === EMPTY && b2 === EMPTY && b3 === EMPTY) return null;
  // Classic: XX 00 00 00
  if (b0 !== 0 && b0 !== EMPTY) return b0;
  // HotA: 00 00 XX YY or FF FF XX YY
  const id = b2 | (b3 << 8);
  if (id === 0 || id === 0xffff) return null;
  return id;
}

function writeCreatureTypeCode(bytes: Uint8Array, typeOff: number, code: number, hotA: boolean): void {
  if (hotA) {
    bytes[typeOff] = ON;
    bytes[typeOff + 1] = ON;
    bytes[typeOff + 2] = code & 0xff;
    bytes[typeOff + 3] = (code >> 8) & 0xff;
    return;
  }
  bytes[typeOff] = code & 0xff;
  bytes[typeOff + 1] = ON;
  bytes[typeOff + 2] = ON;
  bytes[typeOff + 3] = ON;
}

function readCreatureCount(bytes: Uint8Array, countOff: number, hotA: boolean): number {
  if (hotA) return getUint16(bytes, countOff + 2);
  return getInt(bytes, countOff);
}

function writeCreatureCount(bytes: Uint8Array, countOff: number, amount: number, hotA: boolean): void {
  if (hotA) {
    bytes[countOff] = ON;
    bytes[countOff + 1] = ON;
    writeUint16(bytes, countOff + 2, Math.max(0, Math.min(0xffff, amount)));
    return;
  }
  writeInt32(bytes, countOff, amount);
}

function findSpellStart(
  bytes: Uint8Array,
  recordStart: number,
  recordEnd: number,
  guild: GuildSpellSlots | null,
): number {
  const candidates = new Set<number>();

  for (let i = recordStart + 0xa0; i < recordEnd - 8; i++) {
    if (bytes[i] === 0xbf && bytes[i + 1] === 0xfb) {
      candidates.add(i + 8);
    }
  }

  for (let i = recordStart + 0xa8; i < recordEnd - 8; i++) {
    if (bytes[i + 1] === 0x0f && bytes[i + 2] === 0 && bytes[i + 3] === 0) {
      let p = i + 4;
      while (p + 4 <= recordEnd && getUint32(bytes, p) === 0) p += 4;
      if (p + 4 <= recordEnd) candidates.add(p);
    }
  }

  if (guild) {
    const from = recordStart + guild.offset + 5;
    const to = Math.min(recordEnd - 4, from + 0x50);
    for (let p = from; p <= to; p++) {
      const first = getUint32(bytes, p);
      if (first >= 1 && first <= 70) candidates.add(p);
    }
  }

  if (candidates.size === 0) return -1;

  // Prefer bf fb when present and it yields a sane list.
  for (let i = recordStart + 0xa0; i < recordEnd - 8; i++) {
    if (bytes[i] === 0xbf && bytes[i + 1] === 0xfb) {
      const start = i + 8;
      const scored = scoreSpellStart(bytes, start, recordEnd, guild);
      if (scored.valid >= 2 || (guild && scored.valid >= 1)) return start;
    }
  }

  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const start of candidates) {
    const scored = scoreSpellStart(bytes, start, recordEnd, guild);
    if (scored.score > bestScore) {
      bestScore = scored.score;
      best = start;
    }
  }
  return best;
}

function scoreSpellStart(
  bytes: Uint8Array,
  start: number,
  recordEnd: number,
  guild: GuildSpellSlots | null,
): { score: number; valid: number } {
  const expect = guild?.capacity ?? 0;
  const count = expect > 0 ? expect : TOWN_MAX_SPELLS;
  let valid = 0;
  let zeros = 0;
  let len = 0;
  for (let i = 0; i < count && start + i * 4 + 4 <= recordEnd; i++) {
    const code = getUint32(bytes, start + i * 4);
    if (expect === 0 && (code === 0 || code > 70)) break;
    if (code > 70) break;
    len += 1;
    if (code === 0) zeros += 1;
    else if (code >= 1 && code <= 70) valid += 1;
  }
  let score = valid * 3 - zeros;
  if (expect > 0) score -= Math.abs(len - expect);
  if (expect > 0 && valid === 0) score -= 50;
  return { score, valid };
}

function readSpellIds(
  bytes: Uint8Array,
  start: number,
  recordEnd: number,
  fixedSlots: number,
): number[] {
  const av = indexOfWithin(bytes, SPELL_SENTINEL, start, recordEnd);
  const limit = av >= 0 ? av : recordEnd;
  const spells: number[] = [];

  if (fixedSlots > 0) {
    for (let i = 0; i < fixedSlots && start + i * 4 + 4 <= limit; i++) {
      const code = getUint32(bytes, start + i * 4);
      if (code > 70) break;
      spells.push(code);
    }
    while (spells.length < fixedSlots) spells.push(0);
    return spells;
  }

  for (let p = start; p + 4 <= limit && spells.length < TOWN_MAX_SPELLS; p += 4) {
    const code = getUint32(bytes, p);
    if (code === 0 || code > 70) break;
    spells.push(code);
  }
  return spells;
}

function indexOfWithin(bytes: Uint8Array, pattern: Uint8Array, from: number, to: number): number {
  for (let i = from; i <= to - pattern.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (bytes[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

export { TOWN_BUILDING_DEFS };
