import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadAllArtifacts } from '../src/core/constants';
import { Game } from '../src/core/game';
import { locateHotABuildings, Town } from '../src/core/town';
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
  dwellingChainsForFaction,
} from '../src/core/town-constants';
import { hasHotALeadMarker, isValidTownRecordAt, scanTownRecordStarts } from '../src/core/town-scan';
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

describe('faction dwelling chains', () => {
  it('gives Cove a third Frigate tier and Factory two level-7 dwellings', () => {
    const cove = dwellingChainsForFaction('Cove');
    const frigate = cove.find((chain) => chain.label === 'Frigate');
    expect(frigate?.options.map((option) => option.label)).toEqual([
      'None',
      'Built',
      'Upgraded',
      'Gunpowder Warehouse',
    ]);
    expect(frigate?.steps[2] && ((frigate.steps[2].byte << 3) | frigate.steps[2].bit)).toBe(TOWN_BIT.DWELL_3_UP2);

    const factory = dwellingChainsForFaction('Factory');
    expect(factory.map((chain) => chain.label)).toEqual([
      'Halfling Adobe',
      'Foundry',
      'Ranch',
      'Manufactory',
      'Catacombs',
      'Watchtower',
      'Serpentarium',
      'Gantry',
    ]);
  });
});

describe('HotA 1.8.1 building mask', () => {
  it('reads the 6-byte mask and ignores growth flags', () => {
    // Noral (Cove) from Vance-Scenario2: Capitol, Castle, Tavern, Marketplace,
    // Blacksmith, Mage Guild 1, dwellings 1–5, Nix Fort upgraded. Maelstrom absent.
    const bytes = new Uint8Array(80);
    bytes.set([5, 0, 0, 0, 0, 0x21, 0x62, 0x01, 0xc0, 0x07, 0x04], 56);
    for (let i = 0; i < 14; i++) bytes[i * 4] = 1;

    const located = locateHotABuildings(bytes, 0, {
      offset: 56,
      level: 1,
      capacity: 5,
      slots: [5, 0, 0, 0, 0],
    }, true);

    expect(located.writableBytes).toBe(6);
    expect(located.growthOffset).toBe(-1);
    const built = (bit: number) => ((located.buildings[bit >> 3] >> (bit & 7)) & 1) === 1;
    expect(built(TOWN_BIT.MG1)).toBe(true);
    expect(built(TOWN_BIT.MG2)).toBe(false);
    expect(built(TOWN_BIT.TAVERN)).toBe(true);
    expect(built(TOWN_BIT.SHIPYARD)).toBe(false);
    expect(built(TOWN_BIT.CASTLE)).toBe(true);
    expect(built(TOWN_BIT.FORT)).toBe(false);
    expect(built(TOWN_BIT.CAPITOL)).toBe(true);
    expect(built(TOWN_BIT.TOWN_HALL)).toBe(false);
    expect(built(TOWN_BIT.MARKETPLACE)).toBe(true);
    expect(built(TOWN_BIT.RESOURCE_SILO)).toBe(false);
    expect(built(TOWN_BIT.BLACKSMITH)).toBe(true);
    for (let tier = 0; tier < 5; tier++) expect(built(TOWN_BIT.DWELL_1 + tier)).toBe(true);
    expect(built(TOWN_BIT.DWELL_1 + 5)).toBe(false);
    expect(built(TOWN_BIT.DWELL_1_UP + 5)).toBe(true);
    expect(built(TOWN_BIT.DWELL_1 + 6)).toBe(false);
    expect(built(TOWN_BIT.DWELL_1_UP)).toBe(false);
  });

  it('rejects a zero partner on a one-sided HotA name marker', () => {
    const bytes = new Uint8Array(0x50);
    bytes[0x4a] = 0x00;
    bytes[0x4b] = 0xff;
    bytes[0x4c] = 0x00;
    bytes[0x4d] = 0x00;
    expect(hasHotALeadMarker(bytes, 0)).toBe(false);

    bytes[0x4a] = 0xb6;
    bytes[0x4b] = 0xff;
    bytes[0x4c] = 0x04;
    bytes[0x4d] = 0x7e;
    expect(hasHotALeadMarker(bytes, 0)).toBe(true);

    bytes[0x4a] = 0xff;
    bytes[0x4b] = 0xff;
    bytes[0x4c] = 0x01;
    bytes[0x4d] = 0x00;
    expect(hasHotALeadMarker(bytes, 0)).toBe(true);
  });
});

const VANCE_SAVE = '/Users/vlucas/Games/Heroic/Heroes of Might and Magic III - Horn of the Abyss/games/Treasures of the Pyramid/Vance-Scenario2.GM1';

describe('Vance-Scenario2 town hall', () => {
  it.skipIf(!existsSync(VANCE_SAVE))('matches the in-game Cove hall for Noral', async () => {
    const mod = await getGzipModule();
    const bytes = await gzipDecompressWithModule(mod, readFileSync(VANCE_SAVE));
    const game = new Game(bytes, 'Vance-Scenario2.GM1');
    game.applyLang(null);
    loadAllArtifacts();

    expect(game.towns.map((t) => t.name).sort()).toEqual(['Forest', 'Mystos', 'Noral', 'Scar']);

    const noral = new Town(game, game.towns.find((t) => t.name === 'Noral')!.bytePosition);
    expect(noral.faction).toBe('Cove');
    expect(noral.owner).toBe(4);
    expect(noral.getBuildingChainLevel(TOWN_HALL_CHAIN)).toBe(3);
    expect(noral.getBuildingChainLevel(TOWN_FORT_CHAIN)).toBe(3);
    expect(noral.getBuildingChainLevel(TOWN_MAGE_GUILD_CHAIN)).toBeGreaterThanOrEqual(1);
    expect(noral.isBuildingBuilt(buildingDef('Tavern', TOWN_BIT.TAVERN))).toBe(true);
    expect(noral.isBuildingBuilt(buildingDef('Blacksmith', TOWN_BIT.BLACKSMITH))).toBe(true);
    expect(noral.isBuildingBuilt(buildingDef('Marketplace', TOWN_BIT.MARKETPLACE))).toBe(true);
    expect(noral.isBuildingBuilt(buildingDef('Shipyard', TOWN_BIT.SHIPYARD))).toBe(false);

    const chains = dwellingChainsForFaction('Cove');
    expect(chains.map((chain) => chain.label)).toEqual([
      'Nymph Waterfall',
      'Shack',
      'Frigate',
      'Nest',
      'Tower of the Seas',
      'Nix Fort',
      'Maelstrom',
    ]);
    const levels = chains.map((chain) => noral.getBuildingChainLevel(chain));
    expect(levels.filter((level) => level > 0).length).toBeGreaterThanOrEqual(4);
    expect(levels[5]).toBeGreaterThanOrEqual(1);

    const shipyard = buildingDef('Shipyard', TOWN_BIT.SHIPYARD);
    const shipyardBuilt = noral.isBuildingBuilt(shipyard);
    noral.setBuildingBuilt(shipyard, !shipyardBuilt);
    const reopened = await roundTrip(game);
    const again = new Town(reopened, reopened.towns.find((t) => t.name === 'Noral')!.bytePosition);
    expect(again.isBuildingBuilt(shipyard)).toBe(!shipyardBuilt);
  }, 30000);
});
