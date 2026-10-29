import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadAllArtifacts } from '../src/core/constants';
import { Game } from '../src/core/game';
import { Town } from '../src/core/town';
import {
  FACTORY_DWELLING_CHAINS,
  TOWN_BIT,
  TOWN_FORT_CHAIN,
  TOWN_GRAIL_BUILDING,
  TOWN_HALL_CHAIN,
  TOWN_LIBRARY_BUILDING,
  TOWN_MAGE_GUILD_BUILDINGS,
  TOWN_MAGE_GUILD_CHAIN,
  buildingDef,
} from '../src/core/town-constants';
import { isValidTownRecordAt, scanTownRecordStarts } from '../src/core/town-scan';
import {
  gzipCompressWithModule,
  gzipDecompressWithModule,
  loadGzipModuleFromBytes,
  type Homm3GzipModule,
} from '../src/wasm/gzip';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'savedgames');
const WASM_PATH = join(dirname(fileURLToPath(import.meta.url)), '../public/wasm/homm3-gzip.wasm');
const FIXTURE = 'HoMM3Complete-SingleScenario-Start.GM1';
const HOTA_FIXTURE = 'HotA-HotseatMultiplayer.GM2';

const EXPECTED_TOWNS = [
  'Ashden',
  'Candent',
  'Ceald',
  'Corona',
  'Kruber',
  'Lagumoor',
  'Silverspire',
  'Slau',
];

const EXPECTED_HOTA_TOWNS = [
  'Alfheim',
  'Cessacioun',
  'Dark Cloud',
  'Everwinter',
  'Firebrand',
  'Gehenna',
  'Kergar',
  'Lagumoor',
  'Lewindale',
  'New Dolere',
  'Nithenes',
  'Sanctum',
  'Scar',
  'Shadowden',
  'Terminus',
  'White Mouth',
  'Winterkill',
];

let gzipMod: Homm3GzipModule;

async function getGzipModule(): Promise<Homm3GzipModule> {
  if (!gzipMod) {
    gzipMod = await loadGzipModuleFromBytes(readFileSync(WASM_PATH).buffer);
  }
  return gzipMod;
}

async function loadFixture(name = FIXTURE): Promise<Game> {
  const mod = await getGzipModule();
  const compressed = readFileSync(join(FIXTURE_DIR, name));
  const bytes = await gzipDecompressWithModule(mod, compressed);
  const game = new Game(bytes, name);
  game.applyLang(null);
  loadAllArtifacts();
  return game;
}

async function roundTrip(game: Game): Promise<Game> {
  const mod = await getGzipModule();
  const compressed = await gzipCompressWithModule(mod, game.bytes);
  const bytes = await gzipDecompressWithModule(mod, compressed);
  const reopened = new Game(bytes, FIXTURE);
  reopened.applyLang(null);
  loadAllArtifacts();
  return reopened;
}

describe('town struct detection', () => {
  it('finds eight Arrogance towns without using the name catalog', async () => {
    const game = await loadFixture();
    const starts = scanTownRecordStarts(game.bytes);
    expect(starts.length).toBe(8);
    for (const rs of starts) {
      expect(isValidTownRecordAt(game.bytes, rs)).toBe(true);
    }
    const names = starts.map((rs) => game.towns.find((t) => t.bytePosition === rs)?.name).filter(Boolean);
    expect(names.sort()).toEqual([...EXPECTED_TOWNS].sort());
  }, 30000);

  it('scanTowns matches catalog town names on the day-1 fixture', async () => {
    const game = await loadFixture();
    expect(game.towns.map((t) => t.name).sort()).toEqual([...EXPECTED_TOWNS].sort());
    for (const town of game.towns) {
      expect(town.faction).not.toBe('Unknown');
    }
  }, 30000);

  it('finds Crescent Island towns in the HotA hotseat save', async () => {
    const game = await loadFixture(HOTA_FIXTURE);
    const starts = scanTownRecordStarts(game.bytes);
    expect(starts.length).toBe(EXPECTED_HOTA_TOWNS.length);
    expect(game.towns.map((t) => t.name).sort()).toEqual([...EXPECTED_HOTA_TOWNS].sort());
    for (const rs of starts) {
      expect(isValidTownRecordAt(game.bytes, rs)).toBe(true);
    }
  }, 30000);

  it('reads HotA garrison, spells, buildings, and owner correctly', async () => {
    const game = await loadFixture(HOTA_FIXTURE);
    const firebrandSummary = game.towns.find((t) => t.name === 'Firebrand');
    expect(firebrandSummary).toBeDefined();
    expect(firebrandSummary!.owner).toBe(7);

    const firebrand = new Town(game, firebrandSummary!.bytePosition);
    expect(firebrand.isHotA).toBe(true);
    expect(firebrand.owner).toBe(7);
    expect(firebrand.creatures[0]).toBe('Gremlin');
    expect(firebrand.creatureAmounts[0]).toBe(1);
    expect(firebrand.creatures[1]).toBe('Hell Hound');
    expect(firebrand.creatureAmounts[1]).toBe(5);
    // MG2 = 5+4 slots; empty slots are skipped in spellNames()
    expect(firebrand.spellNames()).toEqual([
      'Magic Arrow',
      'Stone Skin',
      'Dispel',
      'Haste',
      'Cure',
      'Weakness',
      'Precision',
      'Lightning Bolt',
    ]);
    expect(firebrand.getBuildingChainLevel(TOWN_FORT_CHAIN)).toBe(3);
    expect(firebrand.getBuildingChainLevel(TOWN_MAGE_GUILD_CHAIN)).toBe(2);
    expect(firebrand.isBuildingBuilt(buildingDef('Tavern', TOWN_BIT.TAVERN))).toBe(true);

    const kergar = new Town(game, game.towns.find((t) => t.name === 'Kergar')!.bytePosition);
    expect(kergar.faction).toBe('Factory');
    expect(kergar.getBuildingChainLevel(TOWN_FORT_CHAIN)).toBe(3);
    expect(kergar.getBuildingChainLevel(TOWN_MAGE_GUILD_CHAIN)).toBe(4);
    expect(kergar.isBuildingBuilt(buildingDef('Tavern', TOWN_BIT.TAVERN))).toBe(true);
    expect(kergar.isBuildingBuilt(buildingDef('Marketplace', TOWN_BIT.MARKETPLACE))).toBe(true);
    expect(kergar.isBuildingBuilt(buildingDef('Resource Silo', TOWN_BIT.RESOURCE_SILO))).toBe(true);
    expect(kergar.isBuildingBuilt(buildingDef('Blacksmith', TOWN_BIT.BLACKSMITH))).toBe(true);
    expect(kergar.isBuildingBuilt(TOWN_GRAIL_BUILDING)).toBe(false);
    for (let tier = 1; tier <= 6; tier++) {
      expect(kergar.getBuildingChainLevel(FACTORY_DWELLING_CHAINS[tier - 1])).toBe(2);
    }
    // Factory dual level-7 lines: Serpentarium + Gantry (both upgraded in this save)
    expect(kergar.getBuildingChainLevel(FACTORY_DWELLING_CHAINS[6])).toBe(2);
    expect(kergar.getBuildingChainLevel(FACTORY_DWELLING_CHAINS[7])).toBe(2);

    const lagumoor = new Town(game, game.towns.find((t) => t.name === 'Lagumoor')!.bytePosition);
    expect(lagumoor.owner).toBe(255);
    expect(lagumoor.creatures.filter(Boolean).length).toBe(7);
    expect(lagumoor.spellNames()).toEqual(
      expect.arrayContaining([
        'Slow',
        'View Earth',
        'Bloodlust',
        'Cure',
        'Lightning Bolt',
        'Blind',
        'Earthquake',
        'Frost Ring',
        'Air Shield',
      ]),
    );
    expect(lagumoor.spellNames().length).toBeGreaterThanOrEqual(11);
    expect(lagumoor.getBuildingChainLevel(TOWN_MAGE_GUILD_CHAIN)).toBe(5);

    const nithenes = new Town(game, game.towns.find((t) => t.name === 'Nithenes')!.bytePosition);
    expect(nithenes.owner).toBe(1);
    expect(nithenes.creatures[0]).toBe('Sorceress');
    expect(nithenes.creatureAmounts[0]).toBe(10);
    expect(nithenes.spellNames().length).toBeGreaterThanOrEqual(8);
    expect(nithenes.getBuildingChainLevel(TOWN_MAGE_GUILD_CHAIN)).toBe(4);
  }, 30000);

  it('limits mage guild spells per level and grants Library bonus for Tower', async () => {
    const game = await loadFixture(HOTA_FIXTURE);
    const firebrand = new Town(game, game.towns.find((t) => t.name === 'Firebrand')!.bytePosition);
    expect(firebrand.mageGuildLevel()).toBeGreaterThanOrEqual(2);
    expect(firebrand.spellCapForLevel(1)).toBe(5);
    expect(firebrand.spellCapForLevel(2)).toBe(4);
    expect(firebrand.spellCapForLevel(3)).toBe(0);
    expect(firebrand.spellsAtLevel(1).length).toBe(5);
    expect(firebrand.canAddSpell('Bless')).toBe(false);
    expect(firebrand.canAddSpell('Fireball')).toBe(false);

    const classic = await loadFixture();
    const silverspire = new Town(
      classic,
      classic.towns.find((t) => t.name === 'Silverspire')!.bytePosition,
    );
    expect(silverspire.faction).toBe('Tower');
    for (const mg of TOWN_MAGE_GUILD_BUILDINGS) {
      silverspire.setBuildingBuilt(mg, true);
    }
    expect(silverspire.spellCapForLevel(1)).toBe(5);
    silverspire.setBuildingBuilt(TOWN_LIBRARY_BUILDING, true);
    expect(silverspire.hasLibrary()).toBe(true);
    expect(silverspire.spellCapForLevel(1)).toBe(6);
    expect(silverspire.spellCapForLevel(5)).toBe(2);

    while (silverspire.spellsAtLevel(1).length < 6) {
      const candidate = ['Magic Arrow', 'Haste', 'Bless', 'Cure', 'Dispel', 'Shield', 'Slow', 'Bloodlust']
        .find((spell) => silverspire.canAddSpell(spell));
      expect(candidate).toBeDefined();
      silverspire.setSpellKnown(candidate!, true);
    }
    expect(silverspire.spellsAtLevel(1).length).toBe(6);
    expect(silverspire.canAddSpell('Stone Skin')).toBe(false);

    silverspire.setBuildingBuilt(TOWN_LIBRARY_BUILDING, false);
    expect(silverspire.hasLibrary()).toBe(false);
    expect(silverspire.spellCapForLevel(1)).toBe(5);
    expect(silverspire.spellsAtLevel(1).length).toBeLessThanOrEqual(5);
  }, 30000);
});

describe('town edit round-trip', () => {
  it('reads classic mage guild spells past empty slots', async () => {
    const game = await loadFixture();
    const ashden = new Town(game, game.towns.find((t) => t.name === 'Ashden')!.bytePosition);
    expect(ashden.spellNames().length).toBeGreaterThan(4);
    expect(ashden.spellNames()).toEqual(
      expect.arrayContaining(['Bloodlust', 'Magic Arrow', 'Curse', 'Slow']),
    );

    const ceald = new Town(game, game.towns.find((t) => t.name === 'Ceald')!.bytePosition);
    expect(ceald.spellNames().length).toBeGreaterThanOrEqual(5);
    expect(ceald.mageGuildLevel()).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('sets progressive building chains with prerequisites', async () => {
    const game = await loadFixture();
    const town = new Town(game, game.towns.find((t) => t.name === 'Lagumoor')!.bytePosition);

    town.setBuildingChainLevel(TOWN_FORT_CHAIN, 3);
    expect(town.getBuildingChainLevel(TOWN_FORT_CHAIN)).toBe(3);
    expect(town.isBuildingBuilt(buildingDef('Fort', TOWN_BIT.FORT))).toBe(true);
    expect(town.isBuildingBuilt(buildingDef('Citadel', TOWN_BIT.CITADEL))).toBe(true);
    expect(town.isBuildingBuilt(buildingDef('Castle', TOWN_BIT.CASTLE))).toBe(true);

    town.setBuildingChainLevel(TOWN_FORT_CHAIN, 1);
    expect(town.getBuildingChainLevel(TOWN_FORT_CHAIN)).toBe(1);
    expect(town.isBuildingBuilt(buildingDef('Fort', TOWN_BIT.FORT))).toBe(true);
    expect(town.isBuildingBuilt(buildingDef('Castle', TOWN_BIT.CASTLE))).toBe(false);

    town.setBuildingChainLevel(TOWN_HALL_CHAIN, 3);
    expect(town.getBuildingChainLevel(TOWN_HALL_CHAIN)).toBe(3);

    town.setBuildingChainLevel(TOWN_MAGE_GUILD_CHAIN, 4);
    expect(town.getBuildingChainLevel(TOWN_MAGE_GUILD_CHAIN)).toBe(4);
    expect(town.spellCapForLevel(4)).toBe(2);
    expect(town.spellCapForLevel(5)).toBe(0);
  }, 30000);

  it('preserves owner, garrison, building, and spell edits', async () => {
    const game = await loadFixture();
    const lagumoor = game.towns.find((t) => t.name === 'Lagumoor');
    expect(lagumoor).toBeDefined();
    const town = new Town(game, lagumoor!.bytePosition);

    const newOwner = town.owner === 7 ? 6 : 7;
    town.updateOwner(newOwner);
    town.updateCreature(0, 'Pixie', 25);
    town.setBuildingChainLevel(TOWN_FORT_CHAIN, 3);
    const removedSpell = town.spellNames()[0];
    if (removedSpell) {
      town.setSpellKnown(removedSpell, false);
    }
    town.setSpellKnown('Slow', true);

    const reopened = await roundTrip(game);
    const againSummary = reopened.towns.find((t) => t.name === 'Lagumoor');
    expect(againSummary).toBeDefined();
    const again = new Town(reopened, againSummary!.bytePosition);

    expect(again.owner).toBe(newOwner);
    expect(again.creatures[0]).toBe('Pixie');
    expect(again.creatureAmounts[0]).toBe(25);
    expect(again.getBuildingChainLevel(TOWN_FORT_CHAIN)).toBe(3);
    expect(again.spellNames()).toContain('Slow');
    if (removedSpell) {
      expect(again.spellNames()).not.toContain(removedSpell);
    }
  }, 30000);
});
