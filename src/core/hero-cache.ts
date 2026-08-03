import type { Game, PresentHero } from './game';

const STORAGE_KEY = 'homm3-present-heroes';

export interface HeroCacheEntry {
  mapName: string;
  version: string;
  lang: string;
  fileName: string;
  heroes: PresentHero[];
  updatedAt: number;
}

function readStore(): Record<string, HeroCacheEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, HeroCacheEntry>;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, HeroCacheEntry>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function heroCacheKey(game: Game): string {
  return `${game.mapName}|${game.version.major}.${game.version.minor}|${game.lang}`;
}

export function getCachedHeroes(key: string): PresentHero[] | null {
  const entry = readStore()[key];
  return entry?.heroes ?? null;
}

export function setCachedHeroes(game: Game, heroes: PresentHero[]): void {
  const key = heroCacheKey(game);
  const store = readStore();
  store[key] = {
    mapName: game.mapName,
    version: game.versionText,
    lang: game.lang,
    fileName: game.fileName,
    heroes,
    updatedAt: Date.now(),
  };
  // Keep last 20 saves worth of hero lists
  const entries = Object.entries(store).sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  writeStore(Object.fromEntries(entries.slice(0, 20)));
}

export function listRecentHeroCaches(): HeroCacheEntry[] {
  return Object.values(readStore()).sort((a, b) => b.updatedAt - a.updatedAt);
}
