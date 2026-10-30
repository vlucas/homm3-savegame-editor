import type { Hero } from './hero';
import { GEAR_SLOTS, type GearSlot } from './constants';

const STAT_LABELS = ['Attack', 'Defense', 'Spell Power', 'Knowledge'] as const;
const SKILL_LEVEL_LABELS = ['', 'Basic', 'Advanced', 'Expert'] as const;

const GEAR_SLOT_LABELS: Record<GearSlot, string> = {
  Helm: 'Head',
  Neck: 'Neck',
  Armor: 'Torso',
  Cloak: 'Cloak',
  Boots: 'Feet',
  Weapon: 'Weapon',
  Shield: 'Shield',
  LeftRing: 'Left Ring',
  RightRing: 'Right Ring',
  Item1: 'Misc 1',
  Item2: 'Misc 2',
  Item3: 'Misc 3',
  Item4: 'Misc 4',
  Item5: 'Misc 5',
};

const CATEGORY_ORDER = [
  'Item',
  'Skill',
  'Artifact',
  'Stat',
  'Level',
  'Experience',
  'Mana',
  'Army',
  'War machine',
  'Spell',
  'Inventory',
] as const;

export type HeroChangeCategory = (typeof CATEGORY_ORDER)[number];

export interface HeroChangeLine {
  category: HeroChangeCategory;
  text: string;
}

export interface HeroSnapshot {
  attributes: number[];
  level: number;
  experience: number;
  mana: number;
  spellBookExist: boolean;
  skills: (string | null)[];
  skillLevels: number[];
  creatures: (string | null)[];
  creatureAmounts: number[];
  warMachines: string[];
  equippedArtifacts: Record<GearSlot, string>;
  equippedSpellScrolls: Record<string, string>;
  spellBook: string[];
  inventory: string[];
  inventorySpellScrolls: Record<number, string>;
}

function skillLabel(skill: string, level: number): string {
  const lvl = SKILL_LEVEL_LABELS[level] || `Level ${level}`;
  return `${skill} (${lvl})`;
}

function artifactLabel(name: string, scroll?: string): string {
  if (name === 'Spell Scroll' && scroll) return `Spell Scroll (${scroll})`;
  return name;
}

export function snapshotHero(hero: Hero): HeroSnapshot {
  const inventorySpellScrolls: Record<number, string> = {};
  for (const [k, v] of hero.inventorySpellScrolls) {
    inventorySpellScrolls[k] = v;
  }
  return {
    attributes: [...hero.attributes],
    level: hero.level,
    experience: hero.experience,
    mana: hero.mana,
    spellBookExist: hero.spellBookExist,
    skills: [...hero.skills],
    skillLevels: [...hero.skillLevels],
    creatures: [...hero.creatures],
    creatureAmounts: [...hero.creatureAmounts],
    warMachines: [...hero.warMachines].sort(),
    equippedArtifacts: { ...hero.equippedArtifacts },
    equippedSpellScrolls: { ...hero.equippedSpellScrolls },
    spellBook: [...hero.spellBook].sort(),
    inventory: [...hero.inventory],
    inventorySpellScrolls,
  };
}

function skillKeySet(skills: (string | null)[], levels: number[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < skills.length; i++) {
    const s = skills[i];
    if (s) map.set(s, levels[i] || 1);
  }
  return map;
}

function inventoryLabels(
  inventory: string[],
  scrolls: Record<number, string>,
): string[] {
  return inventory.map((art, i) => artifactLabel(art, scrolls[i]));
}

/** Net human-readable changes from baseline → current hero state. */
export function diffHero(baseline: HeroSnapshot, hero: Hero): HeroChangeLine[] {
  const current = snapshotHero(hero);
  const lines: HeroChangeLine[] = [];

  if (baseline.spellBookExist !== current.spellBookExist) {
    lines.push({
      category: 'Item',
      text: current.spellBookExist ? 'Add Spellbook' : 'Remove Spellbook',
    });
  }

  const beforeSkills = skillKeySet(baseline.skills, baseline.skillLevels);
  const afterSkills = skillKeySet(current.skills, current.skillLevels);
  for (const [skill, level] of afterSkills) {
    if (!beforeSkills.has(skill)) {
      lines.push({ category: 'Skill', text: `Add ${skillLabel(skill, level)}` });
    } else if (beforeSkills.get(skill) !== level) {
      const from = SKILL_LEVEL_LABELS[beforeSkills.get(skill)!] || String(beforeSkills.get(skill));
      const to = SKILL_LEVEL_LABELS[level] || String(level);
      lines.push({ category: 'Skill', text: `Change ${skill} (${from} → ${to})` });
    }
  }
  for (const [skill, level] of beforeSkills) {
    if (!afterSkills.has(skill)) {
      lines.push({ category: 'Skill', text: `Remove ${skillLabel(skill, level)}` });
    }
  }

  for (const slot of GEAR_SLOTS) {
    const before = artifactLabel(
      baseline.equippedArtifacts[slot],
      baseline.equippedSpellScrolls[slot],
    );
    const after = artifactLabel(
      current.equippedArtifacts[slot],
      current.equippedSpellScrolls[slot],
    );
    if (before === after) continue;
    const slotLabel = GEAR_SLOT_LABELS[slot];
    if (before === '-' && after !== '-') {
      lines.push({ category: 'Artifact', text: `Add '${after}' (${slotLabel})` });
    } else if (before !== '-' && after === '-') {
      lines.push({ category: 'Artifact', text: `Remove '${before}' (${slotLabel})` });
    } else {
      lines.push({
        category: 'Artifact',
        text: `Change '${before}' → '${after}' (${slotLabel})`,
      });
    }
  }

  for (let i = 0; i < STAT_LABELS.length; i++) {
    if (baseline.attributes[i] !== current.attributes[i]) {
      lines.push({
        category: 'Stat',
        text: `Change ${STAT_LABELS[i]} (${baseline.attributes[i]} → ${current.attributes[i]})`,
      });
    }
  }

  if (baseline.level !== current.level) {
    lines.push({
      category: 'Level',
      text: `Change Level (${baseline.level} → ${current.level})`,
    });
  }
  if (baseline.experience !== current.experience) {
    lines.push({
      category: 'Experience',
      text: `Change Experience (${baseline.experience} → ${current.experience})`,
    });
  }
  if (baseline.mana !== current.mana) {
    lines.push({
      category: 'Mana',
      text: `Change Mana (${baseline.mana} → ${current.mana})`,
    });
  }

  for (let i = 0; i < 7; i++) {
    const bCr = baseline.creatures[i];
    const aCr = current.creatures[i];
    const bAmt = baseline.creatureAmounts[i];
    const aAmt = current.creatureAmounts[i];
    if (bCr === aCr && bAmt === aAmt) continue;
    if (!bCr && aCr) {
      lines.push({ category: 'Army', text: `Add ${aAmt} ${aCr}` });
    } else if (bCr && !aCr) {
      lines.push({ category: 'Army', text: `Remove ${bAmt} ${bCr}` });
    } else if (bCr && aCr && bCr !== aCr) {
      lines.push({ category: 'Army', text: `Change ${bAmt} ${bCr} → ${aAmt} ${aCr}` });
    } else if (bCr && aCr && bAmt !== aAmt) {
      lines.push({ category: 'Army', text: `Change ${bCr} amount (${bAmt} → ${aAmt})` });
    }
  }

  const beforeWm = new Set(baseline.warMachines);
  const afterWm = new Set(current.warMachines);
  for (const wm of current.warMachines) {
    if (!beforeWm.has(wm)) {
      lines.push({ category: 'War machine', text: `Add ${wm}` });
    }
  }
  for (const wm of baseline.warMachines) {
    if (!afterWm.has(wm)) {
      lines.push({ category: 'War machine', text: `Remove ${wm}` });
    }
  }

  const beforeSpells = new Set(baseline.spellBook);
  const afterSpells = new Set(current.spellBook);
  for (const sp of current.spellBook) {
    if (!beforeSpells.has(sp)) {
      lines.push({ category: 'Spell', text: `Add ${sp}` });
    }
  }
  for (const sp of baseline.spellBook) {
    if (!afterSpells.has(sp)) {
      lines.push({ category: 'Spell', text: `Remove ${sp}` });
    }
  }

  const beforeInv = inventoryLabels(baseline.inventory, baseline.inventorySpellScrolls);
  const afterInv = inventoryLabels(current.inventory, current.inventorySpellScrolls);
  const beforeInvCounts = new Map<string, number>();
  const afterInvCounts = new Map<string, number>();
  for (const item of beforeInv) {
    beforeInvCounts.set(item, (beforeInvCounts.get(item) ?? 0) + 1);
  }
  for (const item of afterInv) {
    afterInvCounts.set(item, (afterInvCounts.get(item) ?? 0) + 1);
  }
  const invKeys = new Set([...beforeInvCounts.keys(), ...afterInvCounts.keys()]);
  for (const item of [...invKeys].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
    const b = beforeInvCounts.get(item) ?? 0;
    const a = afterInvCounts.get(item) ?? 0;
    if (a > b) {
      const n = a - b;
      lines.push({
        category: 'Inventory',
        text: n === 1 ? `Add '${item}'` : `Add ${n}× '${item}'`,
      });
    } else if (b > a) {
      const n = b - a;
      lines.push({
        category: 'Inventory',
        text: n === 1 ? `Remove '${item}'` : `Remove ${n}× '${item}'`,
      });
    }
  }

  const order = new Map<string, number>(CATEGORY_ORDER.map((c, i) => [c, i]));
  return lines.sort((a, b) => {
    const byCat = (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99);
    if (byCat !== 0) return byCat;
    return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
  });
}
