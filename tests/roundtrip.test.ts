import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadAllArtifacts } from '../src/core/constants';
import { Game } from '../src/core/game';
import type { Hero } from '../src/core/hero';
import {
  gzipCompressWithModule,
  gzipDecompressWithModule,
  loadGzipModuleFromBytes,
  type Homm3GzipModule,
} from '../src/wasm/gzip';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'savedgames');
const WASM_PATH = join(dirname(fileURLToPath(import.meta.url)), '../public/wasm/homm3-gzip.wasm');
const FIXTURE = 'HoMM3Complete-SingleScenario-Start.GM1';
const HERO_NAME = 'Thunar';
const HERO_PLAYER = 0; // Player 1 (Red)

let gzipMod: Homm3GzipModule;

async function getGzipModule(): Promise<Homm3GzipModule> {
  if (!gzipMod) {
    gzipMod = await loadGzipModuleFromBytes(readFileSync(WASM_PATH).buffer);
  }
  return gzipMod;
}

async function loadFixture(): Promise<Game> {
  const mod = await getGzipModule();
  const compressed = readFileSync(join(FIXTURE_DIR, FIXTURE));
  const bytes = await gzipDecompressWithModule(mod, compressed);
  const game = new Game(bytes, FIXTURE);
  game.applyLang(null);
  loadAllArtifacts();
  return game;
}

/** Compress → decompress → reopen, matching download then re-upload. */
async function roundTrip(game: Game): Promise<Game> {
  const errors = game.validateData();
  expect(errors).toEqual([]);
  const mod = await getGzipModule();
  const compressed = await gzipCompressWithModule(mod, game.bytes);
  expect(compressed[0]).toBe(0x1f);
  expect(compressed[1]).toBe(0x8b);
  const bytes = await gzipDecompressWithModule(mod, compressed);
  const reopened = new Game(bytes, FIXTURE);
  reopened.applyLang(null);
  loadAllArtifacts();
  return reopened;
}

function openHero(game: Game): Hero {
  expect(game.searchHero(HERO_NAME, HERO_PLAYER)).toBe(true);
  const hero = game.heroes[0];
  expect(hero.name).toBe(HERO_NAME);
  return hero;
}

describe('end-to-end save round-trip', () => {
  it('preserves primary attributes after export and reload', async () => {
    const game = await loadFixture();
    const hero = openHero(game);
    hero.updateAttribute(0, 17);
    hero.updateAttribute(1, 19);
    hero.updateAttribute(2, 13);
    hero.updateAttribute(3, 21);

    const reopened = await roundTrip(game);
    const again = openHero(reopened);
    expect([...again.attributes]).toEqual([17, 19, 13, 21]);
  }, 30000);

  it('preserves level, experience, and mana after export and reload', async () => {
    const game = await loadFixture();
    const hero = openHero(game);
    hero.updateLevel(22);
    hero.updateExperience(117134);
    hero.updateMana(88);

    const reopened = await roundTrip(game);
    const again = openHero(reopened);
    expect(again.level).toBe(22);
    expect(again.experience).toBe(117134);
    expect(again.mana).toBe(88);
  }, 30000);

  it('preserves secondary skills after export and reload', async () => {
    const game = await loadFixture();
    const hero = openHero(game);
    // Replace / fill first two skill slots with known values.
    hero.updateSkill(0, 'Offense');
    hero.updateSkillLevel(0, 3);
    if (hero.numOfSkills < 2) hero.updateSkill(1, 'Armorer');
    else hero.updateSkill(1, 'Armorer');
    hero.updateSkillLevel(1, 2);

    const reopened = await roundTrip(game);
    const again = openHero(reopened);
    expect(again.skills[0]).toBe('Offense');
    expect(again.skillLevels[0]).toBe(3);
    expect(again.skills[1]).toBe('Armorer');
    expect(again.skillLevels[1]).toBe(2);
  }, 30000);

  it('preserves army stacks after export and reload', async () => {
    const game = await loadFixture();
    const hero = openHero(game);
    hero.updateCreature(0, 'Pikeman');
    hero.updateCreatureAmount(0, 42);
    hero.updateCreature(1, 'Archangel');
    hero.updateCreatureAmount(1, 7);
    hero.updateCreature(2, null);
    for (let i = 3; i < 7; i++) hero.updateCreature(i, null);

    const reopened = await roundTrip(game);
    const again = openHero(reopened);
    expect(again.creatures[0]).toBe('Pikeman');
    expect(again.creatureAmounts[0]).toBe(42);
    expect(again.creatures[1]).toBe('Archangel');
    expect(again.creatureAmounts[1]).toBe(7);
    expect(again.creatures[2]).toBeNull();
    expect(again.creatureAmounts[2]).toBe(0);
  }, 30000);

  it('preserves equipped artifacts after export and reload', async () => {
    const game = await loadFixture();
    const hero = openHero(game);
    hero.updateEquippedArtifact('Helm', 'Helm of Chaos');
    hero.updateEquippedArtifact('Weapon', "Centaur's Axe");
    hero.updateEquippedArtifact('Shield', 'Shield of the Dwarven Lords');
    hero.updateEquippedArtifact('Armor', 'Breastplate of Petrified Wood');
    hero.updateEquippedArtifact('Boots', 'Boots of Speed');
    hero.updateEquippedArtifact('Neck', 'Necklace of Dragonteeth');
    hero.updateEquippedArtifact('Cloak', 'Cape of Conjuring');
    hero.updateEquippedArtifact('LeftRing', 'Ring of Vitality');
    hero.updateEquippedArtifact('RightRing', 'Ring of Life');
    hero.updateEquippedArtifact('Item1', 'Clover of Fortune');

    const reopened = await roundTrip(game);
    const again = openHero(reopened);
    expect(again.equippedArtifacts.Helm).toBe('Helm of Chaos');
    expect(again.equippedArtifacts.Weapon).toBe("Centaur's Axe");
    expect(again.equippedArtifacts.Shield).toBe('Shield of the Dwarven Lords');
    expect(again.equippedArtifacts.Armor).toBe('Breastplate of Petrified Wood');
    expect(again.equippedArtifacts.Boots).toBe('Boots of Speed');
    expect(again.equippedArtifacts.Neck).toBe('Necklace of Dragonteeth');
    expect(again.equippedArtifacts.Cloak).toBe('Cape of Conjuring');
    expect(again.equippedArtifacts.LeftRing).toBe('Ring of Vitality');
    expect(again.equippedArtifacts.RightRing).toBe('Ring of Life');
    expect(again.equippedArtifacts.Item1).toBe('Clover of Fortune');
  }, 30000);

  it('preserves inventory artifacts after export and reload', async () => {
    const game = await loadFixture();
    const hero = openHero(game);
    while (hero.inventory.length > 0) hero.removeFromInventory(0);
    hero.updateInventory('Spyglass');
    hero.updateInventory('Endless Purse of Gold');
    hero.updateInventory('Spell Scroll', 'Magic Arrow');

    const reopened = await roundTrip(game);
    const again = openHero(reopened);
    expect(again.inventory).toEqual(['Spyglass', 'Endless Purse of Gold', 'Spell Scroll']);
    expect(again.inventorySpellScrolls.get(2)).toBe('Magic Arrow');
  }, 30000);

  it('preserves spellbook contents after export and reload', async () => {
    const game = await loadFixture();
    const hero = openHero(game);
    hero.toggleSpellBook(true);
    hero.addSpellToSpellBook('Magic Arrow');
    hero.addSpellToSpellBook('Fireball');
    hero.addSpellToSpellBook('Town Portal');
    hero.removeSpellFromSpellBook('Summon Boat');

    const reopened = await roundTrip(game);
    const again = openHero(reopened);
    expect(again.spellBookExist).toBe(true);
    expect(again.spellBook.has('Magic Arrow')).toBe(true);
    expect(again.spellBook.has('Fireball')).toBe(true);
    expect(again.spellBook.has('Town Portal')).toBe(true);
    expect(again.spellBook.has('Summon Boat')).toBe(false);
  }, 30000);

  it('preserves war machines after export and reload', async () => {
    const game = await loadFixture();
    const hero = openHero(game);
    for (const wm of [...hero.warMachines]) hero.removeWarMachine(wm);
    hero.addWarMachine('Ballista');
    hero.addWarMachine('First Aid Tent');

    const reopened = await roundTrip(game);
    const again = openHero(reopened);
    expect(again.warMachines.has('Ballista')).toBe(true);
    expect(again.warMachines.has('First Aid Tent')).toBe(true);
    expect(again.warMachines.has('Ammo Cart')).toBe(false);
    expect(again.warMachines.has('Catapult')).toBe(false);
  }, 30000);
});
