import type { Town } from './town';
import { formatPlayerLabel } from './game';
import {
  buildingLabelForTown,
  dwellingChainsForFaction,
  TOWN_FORT_CHAIN,
  TOWN_HALL_CHAIN,
  TOWN_MAGE_GUILD_CHAIN,
  TOWN_STANDALONE_BUILDINGS,
  type BuildingChain,
  type TownBuildingDef,
} from './town-constants';

const CATEGORY_ORDER = ['Owner', 'Garrison', 'Building', 'Spell'] as const;

export type TownChangeCategory = (typeof CATEGORY_ORDER)[number];

export interface TownChangeLine {
  category: TownChangeCategory;
  text: string;
}

export interface TownChainSnapshot {
  id: string;
  label: string;
  optionLabel: string;
}

export interface TownBuildingSnapshot {
  key: string;
  label: string;
  built: boolean;
}

export interface TownSnapshot {
  owner: number;
  creatures: (string | null)[];
  creatureAmounts: number[];
  chains: TownChainSnapshot[];
  buildings: TownBuildingSnapshot[];
  spells: string[];
}

function chainsFor(town: Town): BuildingChain[] {
  return [
    TOWN_HALL_CHAIN,
    TOWN_FORT_CHAIN,
    TOWN_MAGE_GUILD_CHAIN,
    ...dwellingChainsForFaction(town.faction),
  ];
}

function standaloneBuildings(town: Town): TownBuildingDef[] {
  return TOWN_STANDALONE_BUILDINGS.filter(
    (def) => buildingLabelForTown(def, town.faction) !== 'Library' || town.faction === 'Tower',
  );
}

function chainOptionLabel(chain: BuildingChain, level: number): string {
  return chain.options.find((option) => option.value === level)?.label ?? String(level);
}

export function snapshotTown(town: Town): TownSnapshot {
  return {
    owner: town.owner,
    creatures: [...town.creatures],
    creatureAmounts: [...town.creatureAmounts],
    chains: chainsFor(town).map((chain) => ({
      id: chain.id,
      label: chain.label,
      optionLabel: chainOptionLabel(chain, town.getBuildingChainLevel(chain)),
    })),
    buildings: standaloneBuildings(town).map((def) => ({
      key: `${def.byte}:${def.bit}`,
      label: buildingLabelForTown(def, town.faction),
      built: town.isBuildingBuilt(def),
    })),
    spells: [...town.spellNames()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
  };
}

/** Net human-readable changes from baseline → current town state. */
export function diffTown(baseline: TownSnapshot, town: Town): TownChangeLine[] {
  const current = snapshotTown(town);
  const lines: TownChangeLine[] = [];

  if (baseline.owner !== current.owner) {
    lines.push({
      category: 'Owner',
      text: `Change Owner (${formatPlayerLabel(baseline.owner)} → ${formatPlayerLabel(current.owner)})`,
    });
  }

  const slots = Math.max(baseline.creatures.length, current.creatures.length);
  for (let i = 0; i < slots; i++) {
    const bCr = baseline.creatures[i];
    const aCr = current.creatures[i];
    const bAmt = baseline.creatureAmounts[i] ?? 0;
    const aAmt = current.creatureAmounts[i] ?? 0;
    if (bCr === aCr && bAmt === aAmt) continue;
    if (!bCr && aCr) {
      lines.push({ category: 'Garrison', text: `Add ${aAmt} ${aCr}` });
    } else if (bCr && !aCr) {
      lines.push({ category: 'Garrison', text: `Remove ${bAmt} ${bCr}` });
    } else if (bCr && aCr && bCr !== aCr) {
      lines.push({ category: 'Garrison', text: `Change ${bAmt} ${bCr} → ${aAmt} ${aCr}` });
    } else if (bCr && aCr && bAmt !== aAmt) {
      lines.push({ category: 'Garrison', text: `Change ${bCr} amount (${bAmt} → ${aAmt})` });
    }
  }

  const currentChains = new Map(current.chains.map((chain) => [chain.id, chain]));
  for (const before of baseline.chains) {
    const after = currentChains.get(before.id);
    if (!after || before.optionLabel === after.optionLabel) continue;
    lines.push({
      category: 'Building',
      text: `Change ${before.label} (${before.optionLabel} → ${after.optionLabel})`,
    });
  }

  const currentBuildings = new Map(current.buildings.map((building) => [building.key, building]));
  for (const before of baseline.buildings) {
    const after = currentBuildings.get(before.key);
    if (!after || before.built === after.built) continue;
    lines.push({
      category: 'Building',
      text: after.built ? `Add ${after.label}` : `Remove ${before.label}`,
    });
  }

  const beforeSpells = new Set(baseline.spells);
  const afterSpells = new Set(current.spells);
  for (const spell of current.spells) {
    if (!beforeSpells.has(spell)) lines.push({ category: 'Spell', text: `Add ${spell}` });
  }
  for (const spell of baseline.spells) {
    if (!afterSpells.has(spell)) lines.push({ category: 'Spell', text: `Remove ${spell}` });
  }

  const order = new Map<string, number>(CATEGORY_ORDER.map((category, index) => [category, index]));
  return lines.sort((a, b) => {
    const byCat = (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99);
    if (byCat !== 0) return byCat;
    return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' });
  });
}
