/** Minimum town record span used for validation / classic SoD layout (Arrogance fixture). */
export const TOWN_RECORD_SIZE = 0x183;
/** HotA town records extend past the classic size. */
export const TOWN_RECORD_SIZE_HOTA = 0x1c0;
/** Mage guild spell slot capacities for levels 1–5 (without Library). */
export const TOWN_GUILD_SLOT_CAPS = [5, 4, 3, 2, 1] as const;
/** Tower Library adds one spell slot per guild level. */
export const TOWN_GUILD_LIBRARY_BONUS = 1;

/** Slot capacity for one spell level (1–5). Library is Tower-only. */
export function guildSpellCapForLevel(level: number, hasLibrary: boolean): number {
  if (level < 1 || level > 5) return 0;
  return TOWN_GUILD_SLOT_CAPS[level - 1] + (hasLibrary ? TOWN_GUILD_LIBRARY_BONUS : 0);
}

/** Total mage-guild spell slots for levels 1..maxLevel. */
export function guildSpellCapacity(maxLevel: number, hasLibrary: boolean): number {
  let total = 0;
  for (let level = 1; level <= Math.max(0, Math.min(5, maxLevel)); level++) {
    total += guildSpellCapForLevel(level, hasLibrary);
  }
  return total;
}
export const TOWN_SCAN_START = 0x10000;
export const TOWN_NAME_LEN_OFFSET = 0x4e;
export const TOWN_NAME_OFFSET = 0x50;
/** Classic SoD/Complete garrison type/count offsets. */
export const TOWN_GARRISON_TYPE_OFFSET = 0x14;
export const TOWN_GARRISON_COUNT_OFFSET = 0x30;
/** HotA garrison slots start 4 bytes earlier; creature id / count sit in the high uint16 of each dword. */
export const TOWN_GARRISON_TYPE_OFFSET_HOTA = 0x10;
export const TOWN_GARRISON_COUNT_OFFSET_HOTA = 0x2c;
/** Classic building bitmask fallback. */
export const TOWN_BUILDINGS_OFFSET = 0x60;
export const TOWN_MARKER_OFFSET = 0x06;
export const TOWN_INDEX_OFFSET = 0x08;
/** HotA owner is a single byte next to the town table index. */
export const TOWN_OWNER_OFFSET_HOTA = 0x09;
/** First town in table uses ff 81 02 at +0x4a instead of 80 b5 at +0x06. */
export const TOWN_LEAD_MARKER_OFFSET = 0x4a;
export const TOWN_FIRST_MARKER_OFFSET = 0x4c;
export const TOWN_META_TYPE_OFFSET = 0;
export const TOWN_META_OWNER_OFFSET = 2;
export const TOWN_ARMY_SLOTS = 7;
export const TOWN_GARRISON_SLOT_SIZE = 4;
export const TOWN_MAX_NAME_LEN = 32;
export const TOWN_MAX_SPELLS = 20;
/** Logical mask size (bits 0–47 cover dwellings through Factory Gantry). */
export const TOWN_BUILDINGS_BYTES = 6;
/** 14 growth slots immediately before HotA guild slot counts (7 base + 7 upgraded). */
export const TOWN_GROWTH_SLOTS = 14;

/** Save-specific town type ids observed in Complete/SoD saves (not the same as map object sub-id). */
export const TOWN_TYPE_FACTION: Record<number, string> = {
  20: 'Conflux',
  16: 'Tower',
};

export interface TownBuildingDef {
  label: string;
  byte: number;
  bit: number;
}

/** Absolute bit index → byte/bit def (VCMI BuildingID order used in HotA saves). */
export function buildingDef(label: string, absBit: number): TownBuildingDef {
  return { label, byte: absBit >> 3, bit: absBit & 7 };
}

export function buildingAbsBit(def: TownBuildingDef): number {
  return def.byte * 8 + def.bit;
}

/**
 * HotA/SoD building bit indexes (Maurice / HotA.dll order):
 * MG1–5, Tavern, Shipyard, Fort, Citadel, Castle, halls, market, silo, blacksmith,
 * Special1–9, Grail, horde slots, then dwellings at bits 30–43.
 * Factory’s second level-7 line (Gantry) uses logical bits 44–45 (growth-backed).
 */
export const TOWN_BIT = {
  MG1: 0,
  MG2: 1,
  MG3: 2,
  MG4: 3,
  MG5: 4,
  TAVERN: 5,
  SHIPYARD: 6,
  FORT: 7,
  CITADEL: 8,
  CASTLE: 9,
  TOWN_HALL: 11,
  CITY_HALL: 12,
  CAPITOL: 13,
  MARKETPLACE: 14,
  RESOURCE_SILO: 15,
  BLACKSMITH: 16,
  SPECIAL_1: 17,
  SPECIAL_6: 22,
  GRAIL: 26,
  HORDE_1: 27,
  DWELL_1: 30,
  DWELL_1_UP: 37,
  /** Factory second level-7 dwelling (Gantry); not in the classic 0–43 set. */
  DWELL_7B: 44,
  DWELL_7B_UP: 45,
} as const;

/** Tower Library is Special 6 in the HotA/SoD building table. */
export const TOWN_LIBRARY_BUILDING: TownBuildingDef = buildingDef('Library', TOWN_BIT.SPECIAL_6);
export const TOWN_GRAIL_BUILDING: TownBuildingDef = buildingDef('Grail', TOWN_BIT.GRAIL);

export const TOWN_MAGE_GUILD_BUILDINGS: TownBuildingDef[] = [
  buildingDef('Mage Guild 1', TOWN_BIT.MG1),
  buildingDef('Mage Guild 2', TOWN_BIT.MG2),
  buildingDef('Mage Guild 3', TOWN_BIT.MG3),
  buildingDef('Mage Guild 4', TOWN_BIT.MG4),
  buildingDef('Mage Guild 5', TOWN_BIT.MG5),
];

/** Flat list kept for tests / generic iteration (not used directly by the radio UI). */
export const TOWN_BUILDING_DEFS: TownBuildingDef[] = [
  buildingDef('Town Hall', TOWN_BIT.TOWN_HALL),
  buildingDef('City Hall', TOWN_BIT.CITY_HALL),
  buildingDef('Capitol', TOWN_BIT.CAPITOL),
  buildingDef('Fort', TOWN_BIT.FORT),
  buildingDef('Citadel', TOWN_BIT.CITADEL),
  buildingDef('Castle', TOWN_BIT.CASTLE),
  buildingDef('Tavern', TOWN_BIT.TAVERN),
  buildingDef('Blacksmith', TOWN_BIT.BLACKSMITH),
  buildingDef('Marketplace', TOWN_BIT.MARKETPLACE),
  buildingDef('Resource Silo', TOWN_BIT.RESOURCE_SILO),
  ...TOWN_MAGE_GUILD_BUILDINGS,
  TOWN_LIBRARY_BUILDING,
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((tier) => [
    buildingDef(`Dwelling ${tier}`, TOWN_BIT.DWELL_1 + tier - 1),
    buildingDef(`Dwelling ${tier} (Upg)`, TOWN_BIT.DWELL_1_UP + tier - 1),
  ]),
];

export function resolveTownFaction(typeId: number, name: string, catalogLookup: (townName: string) => string | null): string {
  const mapped = TOWN_TYPE_FACTION[typeId];
  if (mapped) return mapped;
  return catalogLookup(name) ?? 'Unknown';
}

export function buildingLabelForTown(def: TownBuildingDef, faction: string): string {
  const abs = buildingAbsBit(def);
  if (abs === TOWN_BIT.SPECIAL_6 && faction === 'Tower') return 'Library';
  if (abs === TOWN_BIT.GRAIL) {
    return faction === 'Factory' ? 'Lightning Rod' : 'Grail';
  }
  return def.label;
}

/** Factory dwelling names (two parallel level-7 lines: Serpentarium + Gantry). */
export const FACTORY_DWELLING_LABELS = [
  'Halfling Adobe',
  'Foundry',
  'Ranch',
  'Manufactory',
  'Catacombs',
  'Watchtower',
  'Serpentarium',
  'Gantry',
] as const;

/** Progressive building chains — UI radios; writing sets all prerequisites. */
export interface BuildingChainOption {
  value: number;
  label: string;
}

export interface BuildingChain {
  id: string;
  label: string;
  /** Building defs from lowest to highest upgrade (index 0 = level 1). */
  steps: TownBuildingDef[];
  /** Labels including level 0 (none / village hall). */
  options: BuildingChainOption[];
}

export const TOWN_HALL_CHAIN: BuildingChain = {
  id: 'hall',
  label: 'Hall',
  steps: [
    buildingDef('Town Hall', TOWN_BIT.TOWN_HALL),
    buildingDef('City Hall', TOWN_BIT.CITY_HALL),
    buildingDef('Capitol', TOWN_BIT.CAPITOL),
  ],
  options: [
    { value: 0, label: 'Village Hall' },
    { value: 1, label: 'Town Hall' },
    { value: 2, label: 'City Hall' },
    { value: 3, label: 'Capitol' },
  ],
};

export const TOWN_FORT_CHAIN: BuildingChain = {
  id: 'fort',
  label: 'Fortifications',
  steps: [
    buildingDef('Fort', TOWN_BIT.FORT),
    buildingDef('Citadel', TOWN_BIT.CITADEL),
    buildingDef('Castle', TOWN_BIT.CASTLE),
  ],
  options: [
    { value: 0, label: 'None' },
    { value: 1, label: 'Fort' },
    { value: 2, label: 'Citadel' },
    { value: 3, label: 'Castle' },
  ],
};

export const TOWN_MAGE_GUILD_CHAIN: BuildingChain = {
  id: 'mageGuild',
  label: 'Mage Guild',
  steps: TOWN_MAGE_GUILD_BUILDINGS,
  options: [
    { value: 0, label: 'None' },
    { value: 1, label: 'Level 1' },
    { value: 2, label: 'Level 2' },
    { value: 3, label: 'Level 3' },
    { value: 4, label: 'Level 4' },
    { value: 5, label: 'Level 5' },
  ],
};

export function townDwellingChain(tier: number, label = `Dwelling ${tier}`): BuildingChain {
  const baseBit = tier <= 7 ? TOWN_BIT.DWELL_1 + tier - 1 : TOWN_BIT.DWELL_7B;
  const upBit = tier <= 7 ? TOWN_BIT.DWELL_1_UP + tier - 1 : TOWN_BIT.DWELL_7B_UP;
  return {
    id: `dwelling${tier}`,
    label,
    steps: [
      buildingDef(label, baseBit),
      buildingDef(`${label} (Upg)`, upBit),
    ],
    options: [
      { value: 0, label: 'None' },
      { value: 1, label: 'Built' },
      { value: 2, label: 'Upgraded' },
    ],
  };
}

export const TOWN_DWELLING_CHAINS: BuildingChain[] = [1, 2, 3, 4, 5, 6, 7].map((tier) => townDwellingChain(tier));

/** Factory has eight dwelling lines: tiers 1–6 plus Serpentarium and Gantry at level 7. */
export const FACTORY_DWELLING_CHAINS: BuildingChain[] = [
  ...[1, 2, 3, 4, 5, 6].map((tier) => townDwellingChain(tier, FACTORY_DWELLING_LABELS[tier - 1])),
  townDwellingChain(7, FACTORY_DWELLING_LABELS[6]),
  townDwellingChain(8, FACTORY_DWELLING_LABELS[7]),
];

export function dwellingChainsForFaction(faction: string): BuildingChain[] {
  return faction === 'Factory' ? FACTORY_DWELLING_CHAINS : TOWN_DWELLING_CHAINS;
}

export const TOWN_STANDALONE_BUILDINGS: TownBuildingDef[] = [
  buildingDef('Tavern', TOWN_BIT.TAVERN),
  buildingDef('Blacksmith', TOWN_BIT.BLACKSMITH),
  buildingDef('Marketplace', TOWN_BIT.MARKETPLACE),
  buildingDef('Resource Silo', TOWN_BIT.RESOURCE_SILO),
  buildingDef('Shipyard', TOWN_BIT.SHIPYARD),
  TOWN_LIBRARY_BUILDING,
  TOWN_GRAIL_BUILDING,
];
