import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadAllArtifacts } from '../src/core/constants';
import { Game } from '../src/core/game';
import { loadLangData } from '../src/core/lang';
import { gzipDecompressWithModule, loadGzipModuleFromBytes } from '../src/wasm/gzip';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'savedgames');
const WASM_PATH = join(dirname(fileURLToPath(import.meta.url)), '../public/wasm/homm3-gzip.wasm');

async function load(fileName: string): Promise<Game> {
  const mod = await loadGzipModuleFromBytes(readFileSync(WASM_PATH).buffer);
  const bytes = await gzipDecompressWithModule(mod, readFileSync(join(FIXTURE_DIR, fileName)));
  const game = new Game(bytes, fileName);
  game.applyLang(await loadLangData(game.lang));
  loadAllArtifacts();
  return game;
}

describe('HotA 1.8.1 custom-named heroes', () => {
  it('lists renamed Pac-Man heroes as owned', async () => {
    const game = await load('HotA-1.8.1-333.GM1');
    expect(game.version).toEqual({ major: 44, minor: 11 });
    const present = game.listPresentHeroes();
    const owned = present.filter((h) => h.player <= 7);
    const names = owned.map((h) => h.name).sort();

    expect(owned.length).toBeGreaterThan(0);
    expect(names).toEqual(expect.arrayContaining([
      'Blinky3', 'Blinky5', 'Blinky7', 'Blinky8',
      'Clyde3', 'Clyde7', 'Clyde8',
      'Inky4', 'Inky5', 'Inky7', 'Inky8',
      'Pinky2', 'Pinky5', 'Pinky6', 'Pinky8',
    ]));
  }, 30000);

  it('still lists default-named heroes on Barbarian Breakout 1.8.1', async () => {
    const game = await load('HotA-1.8.1-BarbarianBreakout-Day1.GM1');
    expect(game.version).toEqual({ major: 44, minor: 11 });
    const owned = game.listPresentHeroes().filter((h) => h.player <= 7);
    expect(owned.map((h) => h.label).sort()).toEqual([
      'Caitlin (Player 1 (Red))',
      'Gurnisson (Player 2 (Blue))',
      'Wrathmont (Player 3 (Tan))',
      'Yog (Player 4 (Green))',
    ]);
  }, 30000);
});
