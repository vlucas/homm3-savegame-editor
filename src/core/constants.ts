import lookupData from './generated/lookup-data.json';
import townsData from './generated/towns-data.json';

export const GameExpansion = {
  RoEHD: 'RoEHD',
  RoE: 'RoE',
  Chronicles: 'Chronicles',
  AB: 'AB',
  SoD: 'SoD',
  WoG: 'WoG',
  HotA: 'HotA',
} as const;

export type GameExpansion = (typeof GameExpansion)[keyof typeof GameExpansion];

export const EXPANSION_LABELS: Record<GameExpansion, string> = {
  [GameExpansion.RoEHD]: 'The Restoration of Erathia (HD Edition)',
  [GameExpansion.RoE]: 'The Restoration of Erathia',
  [GameExpansion.Chronicles]: 'Heroes Chronicles',
  [GameExpansion.AB]: "Armageddon's Blade",
  [GameExpansion.SoD]: 'The Shadow of Death',
  [GameExpansion.WoG]: 'In the Wake of Gods',
  [GameExpansion.HotA]: 'Horn of the Abyss',
};

export const HERO_OFFSETS: Record<string, number> = {
  Attributes: 69,
  Helm: 213,
  Cloak: 221,
  Neck: 229,
  Weapon: 237,
  Shield: 245,
  Armor: 253,
  LeftRing: 261,
  RightRing: 269,
  Boots: 277,
  Item1: 285,
  Item2: 293,
  Item3: 301,
  Item4: 309,
  Ballista: 317,
  Canon: 317,
  'Ammo Cart': 325,
  'First Aid Tent': 333,
  Catapult: 341,
  SpellBookSlot: 349,
  Item5: 357,
  Inventory: 365,
  NumOfSkills: -126,
  Skills: 13,
  SkillSlots: 41,
  Spells: 73,
  SpellBook: 143,
  Creatures: -56,
  CreatureAmounts: -28,
  BlockedSlots: 878,
  HeroLevel: -120,
  ManaPoints: -122,
  Experience: -130,
  CoordinatesXMarker: -150,
  CoordinatesYMarker: -146,
  CurrentMovementPoints: -134,
  MaxMovementPoints: -138,
  CoordinatesX: -195,
  CoordinatesY: -193,
  CoordinatesZ: -191,
  Player: -169,
};

/** First byte offset to scan for on-map hero structs (skip roster/name tables). */
export const HERO_SCAN_START = 30000;

export const NEUTRAL_PLAYER = 0xff;

/** Standard HoMM3 player slot colors (players 1–8). */
export const PLAYER_COLORS = [
  'Red', 'Blue', 'Tan', 'Green', 'Orange', 'Purple', 'Teal', 'Pink',
] as const;

export const HEADER_OFFSETS: Record<string, number> = { MapName: 0x3a };

export const EXP_LEVELS: Record<number, number> = lookupData.expLevels as Record<string, number>;

export const LANG_CODES = ['EN', 'RU', 'PL', 'FR'] as const;

export const HERO_LANG_MARKERS = {
  pl: 'Katarzyna',
  ruClassic: 'Адела',
  ruHota: 'Адель',
} as const;

export const EMPTY = 0xff;
export const ON = 0x00;

export class BaseProp {
  namesByCode = new Map<number, string>();
  hotaNamesByCode = new Map<number, string>();
  lang: Map<string, string> | null = null;
  langInverted: Map<string, string> | null = null;
  originalLang: Map<string, string> | null = null;
  hotaLang: Map<string, string> | null = null;

  constructor(names: Record<string, string>, hota: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(names)) this.namesByCode.set(Number(k), v);
    for (const [k, v] of Object.entries(hota)) this.hotaNamesByCode.set(Number(k), v);
  }

  get names(): string[] {
    return [...this.namesByCode.values()].map((n) => this.getLangValue(n));
  }

  get originalNames(): string[] {
    return [...this.namesByCode.values()];
  }

  getByCode(key: number): string {
    const name = this.namesByCode.get(key)!;
    return this.lang?.get(name) ?? name;
  }

  getCode(name: string): number {
    const key = this.langInverted?.get(name) ?? name;
    for (const [code, n] of this.namesByCode) {
      if (n === key) return code;
    }
    throw new Error(`Unknown code for ${name}`);
  }

  getLangValue(key: string): string {
    return this.lang?.get(key) ?? key;
  }

  getOriginalValue(key: string): string {
    return this.langInverted?.get(key) ?? key;
  }

  setLang(langData: Record<string, string> | null, hotaLangData?: Record<string, string>) {
    if (!langData) {
      this.lang = null;
      this.langInverted = null;
      return;
    }
    this.lang = new Map(Object.entries(langData));
    this.originalLang = new Map(Object.entries(langData));
    this.hotaLang = hotaLangData ? new Map(Object.entries(hotaLangData)) : null;
    this.langInverted = new Map(Object.entries(langData).map(([k, v]) => [v, k]));
  }

  loadHotaReferenceCodes() {
    for (const [code, name] of this.hotaNamesByCode) {
      if (!this.namesByCode.has(code)) this.namesByCode.set(code, name);
    }
    if (this.originalLang && this.hotaLang) {
      this.lang = new Map(this.originalLang);
      for (const [k, v] of this.hotaLang) this.lang.set(k, v);
      this.langInverted = new Map([...this.lang.entries()].map(([k, v]) => [v, k]));
    }
  }

  removeHotaReferenceCodes() {
    for (const [code] of this.hotaNamesByCode) this.namesByCode.delete(code);
    if (this.originalLang) {
      this.lang = new Map(this.originalLang);
      this.langInverted = new Map([...this.lang.entries()].map(([k, v]) => [v, k]));
    }
  }

  removeByKey(key: number) {
    this.namesByCode.delete(key);
  }

  getArtifacts(): Map<number, string> {
    const out = new Map<number, string>();
    for (const [code, name] of this.namesByCode) {
      if (name === '-') continue;
      out.set(code, this.lang?.get(name) ?? name);
    }
    return out;
  }
}

function cls(name: keyof typeof lookupData.classes) {
  const c = lookupData.classes[name];
  return new BaseProp(c.namesByCode, c.hotaNamesByCode);
}

export const Skills = cls('Skills');
Skills.hotaNamesByCode.set(29, 'Runes');

export const SkillLevels = cls('SkillLevels');
export const Weapons = cls('Weapons');
Weapons.namesByCode.set(0x80, "Armageddon's Blade");
Weapons.namesByCode.set(0x87, "Titan's Thunder");

export const Shields = cls('Shields');
export const Helms = cls('Helms');
export const Armor = cls('Armor');
export const Cloak = cls('Cloak');
export const Boots = cls('Boots');
export const Neck = cls('Neck');
export const Rings = cls('Rings');
export const Items = cls('Items');
Items.namesByCode.set(0x01, 'Spell Scroll');
Items.namesByCode.set(0x56, 'Tome of Fire Magic');
Items.namesByCode.set(0x57, 'Tome of Air Magic');
Items.namesByCode.set(0x58, 'Tome of Water Magic');
Items.namesByCode.set(0x59, 'Tome of Earth Magic');
export const WarMachines = cls('WarMachines');
WarMachines.namesByCode.set(0x04, 'Ballista');
export const Spells = cls('Spells');
Spells.namesByCode.set(57, "Titan's Lightning Bolt");
export const Creatures = cls('Creatures');

export const ItemsCodes = {
  SpellScroll: 0x01,
  TomeOfFireMagic: 0x56,
  TomeOfAirMagic: 0x57,
  TomeOfWaterMagic: 0x58,
  TomeOfEarthMagic: 0x59,
};

export const WeaponsCodes = {
  ArmageddonsBlade: 0x80,
  TitansThunder: 0x87,
};

export const SkillsCodes = { RunesKey: 29 };
export const CreaturesCodes = { BulwarkStartCode: 186 };

export class ArtifactsRegistry extends BaseProp {
  addArtifacts(source: Map<number, string>) {
    for (const [code, name] of source) {
      this.namesByCode.set(code, name);
    }
  }
}

export const Artifacts = new ArtifactsRegistry({ '255': '-', '2': 'Grail' });

export function loadAllArtifacts() {
  Artifacts.namesByCode.clear();
  Artifacts.namesByCode.set(0xff, '-');
  Artifacts.namesByCode.set(0x02, 'Grail');
  for (const src of [Weapons, Shields, Armor, Cloak, Helms, Rings, Boots, Neck, Items]) {
    Artifacts.addArtifacts(src.getArtifacts());
  }
}

export function getItemSpellsByCode(): Map<number, number[]> {
  return new Map([
    [ItemsCodes.TomeOfFireMagic, (lookupData.itemSpells.TomeOfFireMagic ?? []).map((s) => Spells.getCode(s))],
    [ItemsCodes.TomeOfAirMagic, (lookupData.itemSpells.TomeOfAirMagic ?? []).map((s) => Spells.getCode(s))],
    [ItemsCodes.TomeOfWaterMagic, (lookupData.itemSpells.TomeOfWaterMagic ?? []).map((s) => Spells.getCode(s))],
    [ItemsCodes.TomeOfEarthMagic, (lookupData.itemSpells.TomeOfEarthMagic ?? []).map((s) => Spells.getCode(s))],
    [0x7c, (lookupData.itemSpells.SpellbindersHat ?? []).map((s) => Spells.getCode(s))],
    [WeaponsCodes.TitansThunder, (lookupData.itemSpells.TitansThunder ?? []).map((s) => Spells.getCode(s))],
    [WeaponsCodes.ArmageddonsBlade, (lookupData.itemSpells.ArmageddonsBlade ?? []).map((s) => Spells.getCode(s))],
  ]);
}

export class HeroesRegistry {
  private heroes = [...lookupData.heroes];
  private heroesHota = [...lookupData.heroesHota];
  lang: Map<string, string> | null = null;
  langInverted: Map<string, string> | null = null;

  get names(): string[] {
    return this.heroes.map((h) => this.lang?.get(h) ?? h);
  }

  setLang(
    lang?: Record<string, string>,
    hota?: Record<string, string>,
    unique?: Record<string, string>,
    roeHd?: Record<string, string>,
  ) {
    if (!lang) {
      this.lang = null;
      this.langInverted = null;
      return;
    }
    this.lang = new Map(Object.entries({ ...lang, ...hota, ...unique, ...roeHd }));
    this.langInverted = new Map([...this.lang.entries()].map(([k, v]) => [v, k]));
  }

  loadHotaValues(withBulwark = true) {
    const bulwark = new Set([
      'Kobold', 'Kobold Foremen', 'Mountain Ram', 'Argali', 'Snow Elf', 'Steel Elf',
      'Yeti', 'Yeti Runemaster', 'Shaman', 'Greate Shaman', 'Mammoth', 'War Mammoth',
      'Jotunn', 'Jotunn Warlord',
    ]);
    for (const h of this.heroesHota) {
      if (!this.heroes.includes(h) && (withBulwark || !bulwark.has(h))) this.heroes.push(h);
    }
  }

  removeHotaValues() {
    for (const h of this.heroesHota) {
      const i = this.heroes.indexOf(h);
      if (i >= 0) this.heroes.splice(i, 1);
    }
  }
}

export const Heroes = new HeroesRegistry();

export class TownsRegistry {
  private towns: Record<string, string[]> = structuredClone(townsData.towns);
  private hotaTowns: Record<string, string[]> = townsData.hotaTowns;
  lang: Map<string, string> | null = null;
  langHota: Map<string, string> | null = null;
  langFactions: Map<string, string> | null = null;
  langFactionsHota: Map<string, string> | null = null;
  private langSaved = new Map<string, string>();
  private langFactionsSaved = new Map<string, string>();

  get factions(): string[] {
    return Object.keys(this.towns);
  }

  get(faction: string): string[] {
    return (this.towns[faction] ?? []).map((t) => this.getLangValue(t, faction));
  }

  setLang(
    lang?: Record<string, string>,
    hota?: Record<string, string>,
    factions?: Record<string, string>,
    factionsHota?: Record<string, string>,
  ) {
    this.langSaved.clear();
    this.langFactionsSaved.clear();
    this.lang = lang ? new Map(Object.entries(lang)) : null;
    this.langHota = hota ? new Map(Object.entries(hota)) : null;
    this.langFactions = factions ? new Map(Object.entries(factions)) : null;
    this.langFactionsHota = factionsHota ? new Map(Object.entries(factionsHota)) : null;
  }

  loadHotaLang() {
    if (this.lang && this.langHota) {
      this.langSaved.clear();
      for (const [key, value] of this.langHota) {
        if (this.lang.has(key)) {
          const prev = this.lang.get(key)!;
          if (prev !== value) {
            this.langSaved.set(key, prev);
            this.lang.set(key, value);
          }
        } else {
          this.lang.set(key, value);
        }
      }
    }
    if (this.langFactions && this.langFactionsHota) {
      this.langFactionsSaved.clear();
      for (const [key, value] of this.langFactionsHota) {
        if (this.langFactions.has(key)) {
          const prev = this.langFactions.get(key)!;
          if (prev !== value) {
            this.langFactionsSaved.set(key, prev);
            this.langFactions.set(key, value);
          }
        } else {
          this.langFactions.set(key, value);
        }
      }
    }
  }

  removeHotaLang() {
    if (this.lang) {
      for (const [key, value] of this.langSaved) this.lang.set(key, value);
      this.langSaved.clear();
    }
    if (this.langFactions) {
      for (const [key, value] of this.langFactionsSaved) this.langFactions.set(key, value);
      this.langFactionsSaved.clear();
    }
  }

  loadHotaValues(withBulwark = true) {
    for (const [faction, list] of Object.entries(this.hotaTowns)) {
      if (!withBulwark && faction === 'Bulwark') continue;
      if (!this.towns[faction]) this.towns[faction] = [...list];
    }
  }

  removeHotaValues() {
    for (const faction of Object.keys(this.hotaTowns)) delete this.towns[faction];
  }

  getLangValue(town: string, faction: string): string {
    const key = town === 'Strongglen' ? `${town}.${faction ?? 'Rampart'}` : town;
    return this.lang?.get(key) ?? town;
  }

  getLangFactionValue(key: string): string {
    return this.langFactions?.get(key) ?? key;
  }
}

export const Towns = new TownsRegistry();

export function loadHotaItems(withBulwark = true) {
  reloadHotaReferenceCodes();
  Heroes.loadHotaValues(withBulwark);
  Towns.loadHotaValues(withBulwark);
  if (!withBulwark) {
    Skills.removeByKey(SkillsCodes.RunesKey);
    for (let code = CreaturesCodes.BulwarkStartCode; code < CreaturesCodes.BulwarkStartCode + 14; code++) {
      Creatures.removeByKey(code);
    }
  }
}

export function reloadHotaReferenceCodes() {
  WarMachines.loadHotaReferenceCodes();
  Weapons.loadHotaReferenceCodes();
  Shields.loadHotaReferenceCodes();
  Armor.loadHotaReferenceCodes();
  Cloak.loadHotaReferenceCodes();
  Helms.loadHotaReferenceCodes();
  Rings.loadHotaReferenceCodes();
  Boots.loadHotaReferenceCodes();
  Neck.loadHotaReferenceCodes();
  Items.loadHotaReferenceCodes();
  Creatures.loadHotaReferenceCodes();
  Skills.loadHotaReferenceCodes();
}

export function removeHotaReferenceCodes() {
  WarMachines.removeHotaReferenceCodes();
  Weapons.removeHotaReferenceCodes();
  Shields.removeHotaReferenceCodes();
  Armor.removeHotaReferenceCodes();
  Cloak.removeHotaReferenceCodes();
  Helms.removeHotaReferenceCodes();
  Rings.removeHotaReferenceCodes();
  Boots.removeHotaReferenceCodes();
  Neck.removeHotaReferenceCodes();
  Items.removeHotaReferenceCodes();
  Creatures.removeHotaReferenceCodes();
  Skills.removeHotaReferenceCodes();
  Heroes.removeHotaValues();
  Towns.removeHotaValues();
}

export const GEAR_SLOTS = [
  'Helm', 'Neck', 'Armor', 'Cloak', 'Boots', 'Weapon', 'Shield',
  'LeftRing', 'RightRing', 'Item1', 'Item2', 'Item3', 'Item4', 'Item5',
] as const;

export type GearSlot = (typeof GEAR_SLOTS)[number];

export interface ArtifactGroup {
  label: string;
  artifacts: string[];
}

const GEAR_SLOT_ARTIFACT_SOURCES: Record<GearSlot, BaseProp> = {
  Helm: Helms,
  Neck: Neck,
  Armor: Armor,
  Cloak: Cloak,
  Boots: Boots,
  Weapon: Weapons,
  Shield: Shields,
  LeftRing: Rings,
  RightRing: Rings,
  Item1: Items,
  Item2: Items,
  Item3: Items,
  Item4: Items,
  Item5: Items,
};

const INVENTORY_ARTIFACT_GROUP_SOURCES: { label: string; source: BaseProp }[] = [
  { label: 'Helms', source: Helms },
  { label: 'Neck', source: Neck },
  { label: 'Armor', source: Armor },
  { label: 'Cloak', source: Cloak },
  { label: 'Boots', source: Boots },
  { label: 'Weapons', source: Weapons },
  { label: 'Shields', source: Shields },
  { label: 'Rings', source: Rings },
  { label: 'Miscellaneous', source: Items },
];

export function sortArtifactNames(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function artifactNamesForSource(source: BaseProp): string[] {
  return sortArtifactNames(source.names.filter((name) => name !== '-'));
}

export function getArtifactsForGearSlot(slot: GearSlot): string[] {
  return artifactNamesForSource(GEAR_SLOT_ARTIFACT_SOURCES[slot]);
}

export function getGearSlotArtifactLists(): Record<GearSlot, string[]> {
  return Object.fromEntries(
    GEAR_SLOTS.map((slot) => [slot, getArtifactsForGearSlot(slot)]),
  ) as Record<GearSlot, string[]>;
}

/** Slot options for a gear dropdown, keeping an out-of-slot equipped value visible. */
export function gearSlotArtifactOptions(slot: GearSlot, equipped: string): string[] {
  const allowed = getArtifactsForGearSlot(slot);
  if (equipped !== '-' && !allowed.includes(equipped)) {
    return sortArtifactNames([...allowed, equipped]);
  }
  return allowed;
}

export function getInventoryArtifactGroups(): ArtifactGroup[] {
  const groups = INVENTORY_ARTIFACT_GROUP_SOURCES.map(({ label, source }) => ({
    label,
    artifacts: artifactNamesForSource(source),
  }));
  const grail = Artifacts.getByCode(0x02);
  if (grail !== '-') {
    groups.push({ label: 'Special', artifacts: sortArtifactNames([grail]) });
  }
  return groups.filter((group) => group.artifacts.length > 0);
}

export interface CreatureGroup {
  label: string;
  creatures: string[];
}

const CREATURE_FACTION_DEFS: { faction: string; codes: number[]; hotaOnly?: boolean }[] = [
  { faction: 'Castle', codes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  { faction: 'Rampart', codes: [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27] },
  { faction: 'Tower', codes: [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41] },
  { faction: 'Inferno', codes: [42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55] },
  { faction: 'Necropolis', codes: [56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69] },
  { faction: 'Dungeon', codes: [70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83] },
  { faction: 'Stronghold', codes: [84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97] },
  { faction: 'Fortress', codes: [98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111] },
  { faction: 'Conflux', codes: [112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 123, 125, 127, 129, 130, 131] },
  { faction: 'Cove', codes: [153, 154, 155, 156, 157, 158, 151, 159, 160, 161, 162, 163, 164, 165, 166], hotaOnly: true },
  { faction: 'Factory', codes: [171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185], hotaOnly: true },
  { faction: 'Bulwark', codes: [186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199], hotaOnly: true },
];

const CLASSIC_NEUTRAL_CREATURE_CODES = [132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144];
const HOTA_NEUTRAL_CREATURE_CODES = [167, 168, 169, 170];

function creatureNamesForCodes(codes: number[]): string[] {
  return codes
    .filter((code) => Creatures.namesByCode.has(code))
    .map((code) => Creatures.getByCode(code));
}

export function getCreatureGroups(options: { isHota: boolean; withBulwark: boolean }): CreatureGroup[] {
  const groups: CreatureGroup[] = [];
  for (const def of CREATURE_FACTION_DEFS) {
    if (def.hotaOnly && !options.isHota) continue;
    if (def.faction === 'Bulwark' && options.isHota && !options.withBulwark) continue;
    const creatures = creatureNamesForCodes(def.codes);
    if (creatures.length > 0) {
      groups.push({
        label: Towns.getLangFactionValue(def.faction),
        creatures,
      });
    }
  }
  const neutralCodes = [
    ...CLASSIC_NEUTRAL_CREATURE_CODES,
    ...(options.isHota ? HOTA_NEUTRAL_CREATURE_CODES : []),
  ];
  const neutrals = sortArtifactNames(creatureNamesForCodes(neutralCodes));
  if (neutrals.length > 0) {
    groups.push({ label: 'Neutral', creatures: neutrals });
  }
  return groups;
}

/** Keep an equipped stack visible even when its type is outside normal faction lists. */
export function creatureStackGroups(
  current: string | null,
  groups: CreatureGroup[],
): CreatureGroup[] {
  if (!current) return groups;
  const known = new Set(groups.flatMap((g) => g.creatures));
  if (known.has(current)) return groups;
  return [...groups, { label: 'Other', creatures: [current] }];
}
