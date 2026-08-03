import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Heroes, loadAllArtifacts } from '../src/core/constants';
import { Game, groupPresentHeroes } from '../src/core/game';
import { loadLangData } from '../src/core/lang';
import { loadGzipModuleFromBytes, gzipDecompressWithModule, type Homm3GzipModule } from '../src/wasm/gzip';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'savedgames');
const WASM_PATH = join(dirname(fileURLToPath(import.meta.url)), '../public/wasm/homm3-gzip.wasm');

let gzipMod: Homm3GzipModule;

async function getGzipModule(): Promise<Homm3GzipModule> {
  if (!gzipMod) {
    gzipMod = await loadGzipModuleFromBytes(readFileSync(WASM_PATH).buffer);
  }
  return gzipMod;
}

async function loadSaveFixture(fileName: string): Promise<Game> {
  const mod = await getGzipModule();
  const compressed = readFileSync(join(FIXTURE_DIR, fileName));
  const bytes = await gzipDecompressWithModule(mod, compressed);
  const game = new Game(bytes, fileName);
  const langData = await loadLangData(game.lang);
  game.applyLang(langData);
  loadAllArtifacts();
  return game;
}

const FIXTURE_EXPECTATIONS: Record<string, string[]> = {
  'HoMM3Complete-SingleScenario-Start.GM1': [
    'Pyre (Player 2 (Blue))',
    'Theodorus (Player 6 (Purple))',
    'Thunar (Player 1 (Red))',
    'Vey (Player 7 (Teal))',
  ],
  'HotA-HotseatMultiplayer.GM2': [
    'Allora (Player 3 (Tan))',
    'Andal (Player 2 (Blue))',
    'Bertram (Player 1 (Red))',
    'Brissa (Player 8 (Pink))',
    'Cassiopeia (Player 2 (Blue))',
    'Celestine (Player 1 (Red))',
    'Dace (Player 7 (Teal))',
    'Dessa (Player 1 (Red))',
    'Dury (Player 1 (Red))',
    'Elmore (Player 2 (Blue))',
    'Ergon (Player 3 (Tan))',
    'Fiona (Player 8 (Pink))',
    'Glacius (Player 4 (Green))',
    'Illor (Player 2 (Blue))',
    'Jeremy (Player 2 (Blue))',
    'Josephine (Player 8 (Pink))',
    'Leena (Player 2 (Blue))',
    'Melchior (Player 1 (Red))',
    'Moandor (Player 5 (Orange))',
    'Nagash (Player 5 (Orange))',
    'Nimbus (Player 6 (Purple))',
    'Sandro (Player 5 (Orange))',
    'Septienna (Player 5 (Orange))',
    'Serena (Player 3 (Tan))',
    'Sylvia (Player 4 (Green))',
    'Tancred (Player 1 (Red))',
    'Vidomina (Player 6 (Purple))',
  ],
};

describe('saved game fixtures', () => {
  const files = readdirSync(FIXTURE_DIR).filter((f) =>
    /\.(gm1|gm2|cgm)$/i.test(f),
  );

  it('has at least one save fixture', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file}: lists player-owned on-map heroes`, async () => {
      const game = await loadSaveFixture(file);
      const naiveCount = Heroes.names.filter((n) => game.searchHeroExt(n) !== -1).length;
      const present = game.listPresentHeroes(Heroes.names);
      const owned = present.filter((h) => h.player <= 7);
      const ownedLabels = owned.map((h) => h.label);

      expect(owned.length).toBeGreaterThan(0);
      expect(present.length).toBeLessThan(naiveCount);

      const groups = groupPresentHeroes(present);
      for (const group of groups) {
        const names = group.heroes.map((h) => h.name);
        expect(names).toEqual([...names].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' }),
        ));
      }
      const playerGroups = groups.filter((g) => g.label.startsWith('Player '));
      for (let i = 1; i < playerGroups.length; i++) {
        expect(playerGroups[i].label.localeCompare(playerGroups[i - 1].label)).toBeGreaterThan(0);
      }
      if (groups.some((g) => g.label === 'Neutral or unclaimed')) {
        const last = groups[groups.length - 1];
        expect(last.label).toBe('Neutral or unclaimed');
      }

      const expected = FIXTURE_EXPECTATIONS[file];
      if (expected) expect(ownedLabels.sort()).toEqual([...expected].sort());
    }, 15000);

    it(`${file}: lists all hero structs including roster pool`, async () => {
      const game = await loadSaveFixture(file);
      const onMap = game.listPresentHeroes(Heroes.names);
      const all = game.listAllHeroesInSave(Heroes.names);

      expect(all.length).toBeGreaterThan(onMap.length);

      const groups = groupPresentHeroes(all);
      for (const group of groups) {
        const names = group.heroes.map((h) => h.name);
        expect(names).toEqual([...names].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' }),
        ));
      }
    }, 15000);

    it(`${file}: opens every on-map hero`, async () => {
      const game = await loadSaveFixture(file);
      const onMap = game.listPresentHeroes(Heroes.names);

      for (const entry of onMap) {
        expect(game.searchHero(entry.name, entry.player)).toBe(true);
      }
      expect(game.heroes.length).toBe(onMap.length);
    }, 15000);
  }
});

describe('HotA hotseat hero experience', () => {
  const HOTSEAT_SAVE = 'HotA-HotseatMultiplayer.GM2';

  it('reads Ergon experience as a non-negative uint32', async () => {
    const game = await loadSaveFixture(HOTSEAT_SAVE);
    expect(game.searchHero('Ergon', 2)).toBe(true);
    const ergon = game.heroes[0];
    expect(ergon.name).toBe('Ergon');
    expect(ergon.level).toBe(18);
    expect(ergon.experience).toBe(62506);
    expect(ergon.experience).toBeGreaterThanOrEqual(0);
  }, 30000);
});

describe('HotA hotseat player hero audit', () => {
  const HOTSEAT_SAVE = 'HotA-HotseatMultiplayer.GM2';
  const OUTPUT_PATH = join(FIXTURE_DIR, `${HOTSEAT_SAVE}.player-audit.json`);

  function heroesForPlayer(
    heroes: ReturnType<Game['listPresentHeroes']>,
    playerIndex: number,
  ) {
    return heroes
      .filter((h) => h.player === playerIndex)
      .map((h) => h.name)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  it('lists heroes for player 1 and player 2', async () => {
    const game = await loadSaveFixture(HOTSEAT_SAVE);
    const onMap = game.listPresentHeroes(Heroes.names);
    const allInSave = game.listAllHeroesInSave(Heroes.names);

    const report = {
      save: HOTSEAT_SAVE,
      map: game.mapName,
      version: game.versionText,
      lang: game.lang,
      player1: {
        onMap: heroesForPlayer(onMap, 0),
        allInSave: heroesForPlayer(allInSave, 0),
      },
      player2: {
        onMap: heroesForPlayer(onMap, 1),
        allInSave: heroesForPlayer(allInSave, 1),
      },
    };

    writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

    expect(report.player1.onMap).toEqual([
      'Bertram', 'Celestine', 'Dessa', 'Dury', 'Melchior', 'Tancred',
    ]);
    expect(report.player2.onMap).toEqual([
      'Andal', 'Cassiopeia', 'Elmore', 'Illor', 'Jeremy', 'Leena',
    ]);
  }, 30000);
});
