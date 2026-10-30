import { atom } from 'nanostores';
import type { Hero } from '../core/hero';
import { diffHero, snapshotHero, type HeroSnapshot } from '../core/hero-diff';

export interface TrackedHeroEdit {
  hero: Hero;
  baseline: HeroSnapshot;
}

export interface HeroEditsState {
  /** Keyed by hero bytePosition. */
  entries: Record<number, TrackedHeroEdit>;
  /** Bumped on every edit so React subscribers re-render. */
  revision: number;
}

const initialState = (): HeroEditsState => ({
  entries: {},
  revision: 0,
});

export const heroEditsStore = atom<HeroEditsState>(initialState());

/** Track a hero on first open; no-op if already tracked at this bytePosition. */
export function trackHero(hero: Hero): void {
  const pos = hero.bytePosition;
  const state = heroEditsStore.get();
  if (state.entries[pos]) return;
  heroEditsStore.set({
    ...state,
    entries: {
      ...state.entries,
      [pos]: { hero, baseline: snapshotHero(hero) },
    },
  });
}

export function getTrackedHero(bytePosition: number): Hero | undefined {
  return heroEditsStore.get().entries[bytePosition]?.hero;
}

export function notifyHeroEdited(): void {
  const state = heroEditsStore.get();
  heroEditsStore.set({
    ...state,
    revision: state.revision + 1,
  });
}

export function listTrackedHeroes(): TrackedHeroEdit[] {
  return Object.values(heroEditsStore.get().entries);
}

/** True when any tracked hero differs from its first-open baseline. */
export function hasPendingHeroEdits(): boolean {
  return listTrackedHeroes().some(({ hero, baseline }) => diffHero(baseline, hero).length > 0);
}

export function clearHeroEdits(): void {
  heroEditsStore.set(initialState());
}
