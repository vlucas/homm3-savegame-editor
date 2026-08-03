export interface LangData {
  heroes?: Record<string, string>;
  hotaHeroes?: Record<string, string>;
  uniqueHeroes?: Record<string, string>;
  roeHDHeroes?: Record<string, string>;
  skills?: Record<string, string>;
  skillLevels?: Record<string, string>;
  commonArtifacts?: Record<string, string>;
  weapons?: Record<string, string>;
  hotaWeapons?: Record<string, string>;
  shields?: Record<string, string>;
  hotaShields?: Record<string, string>;
  helms?: Record<string, string>;
  hotaHelms?: Record<string, string>;
  armor?: Record<string, string>;
  hotaArmor?: Record<string, string>;
  cloak?: Record<string, string>;
  hotaCloak?: Record<string, string>;
  boots?: Record<string, string>;
  hotaBoots?: Record<string, string>;
  neck?: Record<string, string>;
  hotaNeck?: Record<string, string>;
  rings?: Record<string, string>;
  hotaRings?: Record<string, string>;
  items?: Record<string, string>;
  hotaItems?: Record<string, string>;
  warMachines?: Record<string, string>;
  spells?: Record<string, string>;
  spellDescriptions?: Record<string, string>;
  creatures?: Record<string, string>;
  factions?: Record<string, string>;
  hotaFactions?: Record<string, string>;
  towns?: Record<string, string>;
  hotaTowns?: Record<string, string>;
}

interface RawLangFile {
  Heroes?: Record<string, string>;
  HotaHeroes?: Record<string, string>;
  UniqueHeroes?: Record<string, string>;
  RoEHDHeroes?: Record<string, string>;
  Skills?: Record<string, string>;
  SkillLevels?: Record<string, string>;
  CommonArtifacts?: Record<string, string>;
  Weapons?: Record<string, string>;
  HotaWeapons?: Record<string, string>;
  Shields?: Record<string, string>;
  HotaShields?: Record<string, string>;
  Helms?: Record<string, string>;
  HotaHelms?: Record<string, string>;
  Armor?: Record<string, string>;
  HotaArmor?: Record<string, string>;
  Cloak?: Record<string, string>;
  HotaCloak?: Record<string, string>;
  Boots?: Record<string, string>;
  HotaBoots?: Record<string, string>;
  Neck?: Record<string, string>;
  HotaNeck?: Record<string, string>;
  Rings?: Record<string, string>;
  HotaRings?: Record<string, string>;
  Items?: Record<string, string>;
  HotaItems?: Record<string, string>;
  WarMachines?: Record<string, string>;
  Spells?: Record<string, string>;
  SpellDescriptions?: Record<string, string>;
  Creatures?: Record<string, string>;
  Factions?: Record<string, string>;
  HotaFactions?: Record<string, string>;
  Towns?: Record<string, string>;
  HotaTowns?: Record<string, string>;
}

const cache = new Map<string, LangData | null>();

function stripJsonComments(text: string): string {
  return text.replace(/^\s*\/\/.*$/gm, '');
}

function mapLang(raw: RawLangFile): LangData {
  return {
    heroes: raw.Heroes,
    hotaHeroes: raw.HotaHeroes,
    uniqueHeroes: raw.UniqueHeroes,
    roeHDHeroes: raw.RoEHDHeroes,
    skills: raw.Skills,
    skillLevels: raw.SkillLevels,
    commonArtifacts: raw.CommonArtifacts,
    weapons: raw.Weapons,
    hotaWeapons: raw.HotaWeapons,
    shields: raw.Shields,
    hotaShields: raw.HotaShields,
    helms: raw.Helms,
    hotaHelms: raw.HotaHelms,
    armor: raw.Armor,
    hotaArmor: raw.HotaArmor,
    cloak: raw.Cloak,
    hotaCloak: raw.HotaCloak,
    boots: raw.Boots,
    hotaBoots: raw.HotaBoots,
    neck: raw.Neck,
    hotaNeck: raw.HotaNeck,
    rings: raw.Rings,
    hotaRings: raw.HotaRings,
    items: raw.Items,
    hotaItems: raw.HotaItems,
    warMachines: raw.WarMachines,
    spells: raw.Spells,
    spellDescriptions: raw.SpellDescriptions,
    creatures: raw.Creatures,
    factions: raw.Factions,
    hotaFactions: raw.HotaFactions,
    towns: raw.Towns,
    hotaTowns: raw.HotaTowns,
  };
}

export async function loadLangData(lang: string): Promise<LangData | null> {
  const key = lang.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  if (key === 'en') {
    cache.set(key, null);
    return null;
  }
  try {
    const resp = await fetch(`${import.meta.env.BASE_URL}lang/lang-data.${key}.json`);
    if (!resp.ok) throw new Error('missing');
    const raw = JSON.parse(stripJsonComments(await resp.text())) as RawLangFile;
    const data = mapLang(raw);
    cache.set(key, data);
    return data;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export function clearLangCache() {
  cache.clear();
}
