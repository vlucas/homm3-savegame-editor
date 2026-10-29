import type { LangData } from './lang';
import {
  Artifacts,
  Creatures,
  GameExpansion,
  HEADER_OFFSETS,
  HERO_LANG_MARKERS,
  HERO_OFFSETS,
  HERO_SCAN_START,
  NEUTRAL_PLAYER,
  PLAYER_COLORS,
  Heroes,
  Items,
  Helms,
  Armor,
  Cloak,
  Boots,
  Neck,
  Rings,
  Shields,
  Weapons,
  ItemsCodes,
  Skills,
  Spells,
  Towns,
  WarMachines,
  WeaponsCodes,
  loadAllArtifacts,
  loadHotaItems,
  reloadHotaReferenceCodes,
  removeHotaReferenceCodes,
} from './constants';
import { heroNamePattern, indexOfPattern, startsWith, getUint16 } from './bytes';
import { decodeSaveString, encodeWin1251 } from './encoding';
import { TOWN_OWNER_OFFSET_HOTA, resolveTownFaction } from './town-constants';
import { Hero } from './hero';
import { Town } from './town';
import { scanTownRecordStarts, readTownName, isHotATownLayout } from './town-scan';
import { gzipCompress, gzipDecompress } from '../wasm/gzip';

export interface TownSummary {
  name: string;
  faction: string;
  factionLang: string;
  bytePosition: number;
  owner: number;
}

export interface PresentHero {
  name: string;
  player: number;
  label: string;
  key: string;
}

export function formatPlayerLabel(player: number): string {
  if (player >= 0 && player <= 7) {
    return `Player ${player + 1} (${PLAYER_COLORS[player]})`;
  }
  if (player === NEUTRAL_PLAYER) return 'Neutral';
  return 'Unknown';
}

export function presentHeroKey(name: string, player: number): string {
  return `${name}|${player}`;
}

export interface PresentHeroGroup {
  label: string;
  heroes: PresentHero[];
}

/** Owned heroes by player 1–8, then neutral/unclaimed — each group A→Z. */
export function groupPresentHeroes(heroes: PresentHero[]): PresentHeroGroup[] {
  const groups: PresentHeroGroup[] = [];
  const cmp = (a: PresentHero, b: PresentHero) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  for (let player = 0; player <= 7; player++) {
    const owned = heroes.filter((h) => h.player === player).sort(cmp);
    if (owned.length > 0) {
      groups.push({ label: formatPlayerLabel(player), heroes: owned });
    }
  }

  const neutral = heroes.filter((h) => h.player === NEUTRAL_PLAYER).sort(cmp);
  if (neutral.length > 0) {
    groups.push({ label: 'Neutral or unclaimed', heroes: neutral });
  }

  return groups;
}

export class Game {
  isHOTA = false;
  versionText = '';
  version: { minor: number; major: number } = { minor: 0, major: 0 };
  expansion: GameExpansion = GameExpansion.RoE;
  lang = 'en';
  bytes: Uint8Array;
  fileName: string;
  mapName = '';
  mapDescription = '';
  heroes: Hero[] = [];
  towns: TownSummary[] = [];
  openTowns: Town[] = [];

  private heroOffsets = { ...HERO_OFFSETS };
  private headerOffsets = { ...HEADER_OFFSETS };

  constructor(bytes: Uint8Array, fileName: string) {
    this.bytes = bytes;
    this.fileName = fileName;

    const chronPattern = new TextEncoder().encode('HCHRONSVG');
    if (startsWith(bytes, chronPattern)) {
      this.version = { minor: bytes[0x0c + 1], major: bytes[0x08 + 1] };
    } else {
      this.version = { minor: bytes[0x0c], major: bytes[0x08] };
    }

    if (this.version.major >= 44 && this.version.minor >= 5) {
      this.lang = this.searchHeroExt(HERO_LANG_MARKERS.pl) > 0
        ? 'pl'
        : this.searchHeroExt(HERO_LANG_MARKERS.ruHota) > 0 ? 'ru' : 'en';
      this.setHota();
    } else {
      this.lang = this.searchHeroExt(HERO_LANG_MARKERS.pl) > 0
        ? 'pl'
        : this.searchHeroExt(HERO_LANG_MARKERS.ruClassic) > 0 ? 'ru' : 'en';
      this.setClassic();
    }

    this.mapName = this.getStringByOffset(this.headerOffsets.MapName);
    this.mapDescription = this.getStringByOffset(this.headerOffsets.MapName + 2 + this.mapName.length);
    this.versionText = `${this.version.major}.${this.version.minor} (${this.expansionLabel()})`;
    loadAllArtifacts();
    this.scanTowns();
  }

  get offsets() {
    return this.heroOffsets;
  }

  expansionLabel(): string {
    const labels: Record<GameExpansion, string> = {
      [GameExpansion.RoEHD]: 'The Restoration of Erathia (HD Edition)',
      [GameExpansion.RoE]: 'The Restoration of Erathia',
      [GameExpansion.Chronicles]: 'Heroes Chronicles',
      [GameExpansion.AB]: "Armageddon's Blade",
      [GameExpansion.SoD]: 'The Shadow of Death',
      [GameExpansion.WoG]: 'In the Wake of Gods',
      [GameExpansion.HotA]: 'Horn of the Abyss',
    };
    return labels[this.expansion];
  }

  setHota() {
    this.isHOTA = true;
    const withBulwark = this.version.minor >= 10;
    this.expansion = GameExpansion.HotA;
    loadHotaItems(withBulwark);
    this.heroOffsets.SkillSlots = 923;
    this.headerOffsets.MapName = this.version.minor >= 9 ? 0x5f : 0x44;
  }

  setClassic() {
    this.isHOTA = false;
    this.heroOffsets.SkillSlots = 41;
    removeHotaReferenceCodes();
    if (this.version.major === 42 && this.version.minor > 0) this.expansion = GameExpansion.SoD;
    if ((this.version.major === 42 && this.version.minor === 0) || (this.version.major === 43 && this.version.minor >= 5)) {
      this.expansion = GameExpansion.Chronicles;
      this.headerOffsets.MapName = 0x3b;
    }
    if (this.version.major === 18) {
      this.expansion = GameExpansion.RoEHD;
      this.headerOffsets.MapName = 0x36;
    }
  }

  applyLang(data: LangData | null) {
    if (!data) {
      Skills.setLang(null);
      Spells.setLang(null);
      Creatures.setLang(null);
      Heroes.setLang();
      Towns.setLang();
      loadAllArtifacts();
      if (this.isHOTA) reloadHotaReferenceCodes();
      return;
    }
    Skills.setLang(data.skills ?? null);
    Spells.setLang(data.spells ?? null);
    Creatures.setLang(data.creatures ?? null);
    Artifacts.setLang(data.commonArtifacts ?? null);
    Weapons.setLang(data.weapons ?? null, data.hotaWeapons);
    Shields.setLang(data.shields ?? null, data.hotaShields);
    Helms.setLang(data.helms ?? null, data.hotaHelms);
    Armor.setLang(data.armor ?? null, data.hotaArmor);
    Cloak.setLang(data.cloak ?? null, data.hotaCloak);
    Boots.setLang(data.boots ?? null, data.hotaBoots);
    Neck.setLang(data.neck ?? null, data.hotaNeck);
    Rings.setLang(data.rings ?? null, data.hotaRings);
    Items.setLang(data.items ?? null, data.hotaItems);
    WarMachines.setLang(data.warMachines ?? null);
    Heroes.setLang(data.heroes, data.hotaHeroes, data.uniqueHeroes, data.roeHDHeroes);
    Towns.setLang(data.towns, data.hotaTowns, data.factions, data.hotaFactions);
    if (this.isHOTA) {
      Towns.loadHotaLang();
      reloadHotaReferenceCodes();
    }
    loadAllArtifacts();
  }

  private getStringByOffset(offset: number): string {
    return decodeSaveString(this.bytes, offset, this.lang);
  }

  searchHeroExt(name: string): number {
    const pattern = heroNamePattern(name, encodeWin1251);
    return indexOfPattern(this.bytes, pattern);
  }

  /** All byte offsets where `name` appears in the save (left-to-right). */
  findHeroPositions(name: string): number[] {
    const pattern = heroNamePattern(name, encodeWin1251);
    const positions: number[] = [];
    let from = 0;
    while (from <= this.bytes.length - pattern.length) {
      const idx = indexOfPattern(this.bytes.subarray(from), pattern);
      if (idx === -1) break;
      const pos = from + idx;
      positions.push(pos);
      from = pos + 1;
    }
    return positions;
  }

  /** Search backward from `startPosition` for the next hero name match. */
  searchHeroFrom(name: string, startPosition: number): number {
    const pattern = heroNamePattern(name, encodeWin1251);
    for (let i = startPosition - pattern.length; i > 0; i--) {
      let found = true;
      for (let j = 0; j < pattern.length; j++) {
        if (this.bytes[i + j] !== pattern[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }

  /** True when `bytePosition` looks like a full hero struct, not a name-table entry. */
  isValidHeroAt(bytePosition: number): boolean {
    if (bytePosition < HERO_SCAN_START) return false;
    const o = this.heroOffsets;
    const b = this.bytes;
    const need = Math.min(o.Player, o.HeroLevel, o.NumOfSkills);
    if (bytePosition + need < 0 || bytePosition + o.HeroLevel >= b.length) return false;

    const level = b[bytePosition + o.HeroLevel];
    if (level > 75) return false;

    const numSkills = b[bytePosition + o.NumOfSkills];
    if (numSkills > 28) return false;
    if (
      b[bytePosition + o.NumOfSkills + 1] !== 0
      || b[bytePosition + o.NumOfSkills + 2] !== 0
      || b[bytePosition + o.NumOfSkills + 3] !== 0
    ) return false;

    const player = b[bytePosition + o.Player];
    if (player > 7 && player !== NEUTRAL_PLAYER) return false;

    return true;
  }

  /** Hero is on the map under player control (excludes the 0xFF roster pool). */
  isActiveHeroAt(bytePosition: number): boolean {
    return this.isValidHeroAt(bytePosition) && this.getHeroPlayer(bytePosition) <= 7;
  }

  /** Neutral hero on the map (excludes default roster-pool templates). */
  isNeutralHeroAt(bytePosition: number): boolean {
    return this.isValidHeroAt(bytePosition)
      && this.getHeroPlayer(bytePosition) === NEUTRAL_PLAYER
      && !this.isRosterTemplateAt(bytePosition);
  }

  /** Default roster-pool copy shipped with every save (player 0xFF, level 1, no gear). */
  isRosterTemplateAt(bytePosition: number): boolean {
    if (!this.isValidHeroAt(bytePosition)) return false;
    if (this.getHeroPlayer(bytePosition) !== NEUTRAL_PLAYER) return false;
    const o = this.heroOffsets;
    const b = this.bytes;
    if (b[bytePosition + o.HeroLevel] !== 1) return false;
    if (this.hasEquippedGear(bytePosition)) return false;
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const mov = view.getUint32(bytePosition + o.MaxMovementPoints, true);
    return mov >= 1500 && mov <= 1800;
  }

  isListedHeroAt(bytePosition: number): boolean {
    return this.isActiveHeroAt(bytePosition) || this.isNeutralHeroAt(bytePosition);
  }

  private hasEquippedGear(bytePosition: number): boolean {
    const o = this.heroOffsets;
    const b = this.bytes;
    for (const slot of ['Helm', 'Cloak', 'Neck', 'Weapon', 'Shield', 'Armor', 'Boots']) {
      const code = b[bytePosition + o[slot]];
      if (code !== 0xff && code !== 0) return true;
    }
    return false;
  }

  getHeroPlayer(bytePosition: number): number {
    return this.bytes[bytePosition + this.heroOffsets.Player];
  }

  /** Heroes on the map discovered by struct fingerprint (no name catalog required). */
  scanPresentHeroes(): PresentHero[] {
    const entries: PresentHero[] = [];
    const seen = new Set<string>();

    for (let pos = HERO_SCAN_START; pos < this.bytes.length - 200; pos++) {
      if (!this.isListedHeroAt(pos)) continue;
      const name = this.readHeroNameAt(pos);
      if (!name) continue;
      const player = this.getHeroPlayer(pos);
      const key = presentHeroKey(name, player);
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        name,
        player,
        key,
        label: player === NEUTRAL_PLAYER
          ? name
          : `${name} (${formatPlayerLabel(player)})`,
      });
    }

    return groupPresentHeroes(entries).flatMap((g) => g.heroes);
  }

  private readHeroNameAt(bytePosition: number): string {
    const raw = this.bytes.subarray(bytePosition, bytePosition + 12);
    let end = raw.indexOf(0);
    if (end < 0) end = raw.length;
    const slice = raw.subarray(0, end);
    if (slice.length === 0) return '';
    if (![...slice].every((b) => b >= 32 && b < 127)) {
      return decodeSaveString(this.bytes, bytePosition - 2, this.lang).trim();
    }
    return new TextDecoder('latin1').decode(slice);
  }

  /** @deprecated Use scanPresentHeroes(); kept for lang-marker probes. */
  listPresentHeroes(candidates: readonly string[]): PresentHero[] {
    return this.listHeroEntries(candidates, (p) => this.isListedHeroAt(p));
  }

  /** Every hero struct in the save, including roster-pool templates. */
  listAllHeroesInSave(candidates: readonly string[]): PresentHero[] {
    return this.listHeroEntries(candidates, (p) => this.isValidHeroAt(p));
  }

  private listHeroEntries(
    candidates: readonly string[],
    include: (bytePosition: number) => boolean,
  ): PresentHero[] {
    const seen = new Set<string>();
    const entries: PresentHero[] = [];

    for (const name of candidates) {
      for (const pos of this.findHeroPositions(name)) {
        if (!include(pos)) continue;
        const player = this.getHeroPlayer(pos);
        const key = presentHeroKey(name, player);
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          name,
          player,
          key,
          label: player === NEUTRAL_PLAYER
            ? name
            : `${name} (${formatPlayerLabel(player)})`,
        });
      }
    }

    return groupPresentHeroes(entries).flatMap((g) => g.heroes);
  }

  searchHero(name: string, player?: number): boolean {
    const positions = this.findHeroPositions(name).filter((p) => {
      if (!this.isValidHeroAt(p)) return false;
      return player === undefined || this.getHeroPlayer(p) === player;
    });
    const opened = new Set(
      this.heroes.filter((h) => h.name === name).map((h) => h.bytePosition),
    );
    const bytePosition = positions.find((p) => !opened.has(p));
    if (bytePosition === undefined) return false;
    this.heroes.push(new Hero(name, this, bytePosition));
    return true;
  }

  validateData(): string[] {
    const result: string[] = [];
    for (const hero of this.heroes) {
      if (
        hero.equippedArtifacts.Weapon === "Titan's Thunder" &&
        !hero.spellBookExist
      ) {
        result.push(`${hero.name}: must have Spell Book with Titan's Thunder`);
      }
    }
    return result;
  }

  async exportCompressed(): Promise<Uint8Array> {
    const errors = this.validateData();
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return gzipCompress(this.bytes);
  }

  scanTowns() {
    this.towns = [];
    const records = scanTownRecordStarts(this.bytes);
    for (const bytePosition of records) {
      const name = readTownName(this.bytes, bytePosition);
      if (!name) continue;
      const hotA = isHotATownLayout(this.bytes, bytePosition);
      let typeId = 0;
      let owner = 0;
      if (hotA) {
        owner = this.bytes[bytePosition + TOWN_OWNER_OFFSET_HOTA];
      } else {
        const len = getUint16(this.bytes, bytePosition + 0x4e);
        const meta = bytePosition + 0x50 + len;
        typeId = getUint16(this.bytes, meta);
        owner = getUint16(this.bytes, meta + 2);
      }
      const faction = resolveTownFaction(typeId, name, (town) => Towns.factionForTown(town));
      this.towns.push({
        name,
        faction,
        factionLang: Towns.getLangFactionValue(faction),
        bytePosition,
        owner,
      });
    }
    this.towns.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  openTown(bytePosition: number): Town | null {
    const summary = this.towns.find((t) => t.bytePosition === bytePosition);
    if (!summary) return null;
    const existing = this.openTowns.find((t) => t.bytePosition === bytePosition);
    if (existing) {
      this.openTowns = [existing];
      return existing;
    }
    const town = new Town(this, bytePosition);
    this.openTowns = [town];
    return town;
  }

  /** Legacy name-catalog town search; scanTowns() replaces this for listing. */
  searchTownsLegacy() {
    this.towns = [];
    let position = this.bytes.length;
    for (const faction of Towns.factions) {
      for (const town of Towns.get(faction)) {
        const found = this.searchTown(town, faction, position);
        if (found) position = found.bytePosition;
      }
    }
  }

  private searchTown(town: string, faction: string, position: number): TownSummary | null {
    const isCyrillic = /\p{Script=Cyrillic}/u.test(town);
    const pattern = isCyrillic ? encodeWin1251(town) : new TextEncoder().encode(town);
    for (let i = position - pattern.length; i > 0; i--) {
      let found = true;
      for (let j = 0; j < pattern.length; j++) {
        if (this.bytes[i + j] !== pattern[j]) {
          found = false;
          break;
        }
      }
      if (!found) continue;
      if (this.towns.some((t) => t.bytePosition === i)) return null;
      const prev = this.bytes[i - 1];
      const next = this.bytes[i + pattern.length];
      if (isLetter(prev) || isLetter(next) || prev === 0x20 || next === 0x20) continue;
      const entry: TownSummary = {
        name: town,
        faction,
        factionLang: Towns.getLangFactionValue(faction),
        bytePosition: i,
        owner: 0,
      };
      this.towns.push(entry);
      return entry;
    }
    return null;
  }
}

function isLetter(b: number): boolean {
  return (b >= 65 && b <= 90) || (b >= 97 && b <= 122);
}

export async function loadGame(file: File, langData: LangData | null): Promise<Game> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const isBin = !name.endsWith('.cgm') && !name.endsWith('.gm1') && !name.endsWith('.gm2');
  const bytes = isBin ? buf : await gzipDecompress(buf);
  const game = new Game(bytes, file.name);
  game.applyLang(langData);
  return game;
}

export { gzipDecompress, gzipCompress, ItemsCodes, WeaponsCodes };
