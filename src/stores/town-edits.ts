import { atom } from 'nanostores';
import type { Town } from '../core/town';
import { diffTown, snapshotTown, type TownSnapshot } from '../core/town-diff';

export interface TrackedTownEdit {
  town: Town;
  baseline: TownSnapshot;
}

export interface TownEditsState {
  /** Keyed by town bytePosition. */
  entries: Record<number, TrackedTownEdit>;
  /** Bumped on every edit so React subscribers re-render. */
  revision: number;
}

const initialState = (): TownEditsState => ({
  entries: {},
  revision: 0,
});

export const townEditsStore = atom<TownEditsState>(initialState());

/** Track a town on first open; no-op if already tracked at this bytePosition. */
export function trackTown(town: Town): void {
  const pos = town.bytePosition;
  const state = townEditsStore.get();
  if (state.entries[pos]) return;
  townEditsStore.set({
    ...state,
    entries: {
      ...state.entries,
      [pos]: { town, baseline: snapshotTown(town) },
    },
  });
}

export function getTrackedTown(bytePosition: number): Town | undefined {
  return townEditsStore.get().entries[bytePosition]?.town;
}

export function notifyTownEdited(): void {
  const state = townEditsStore.get();
  townEditsStore.set({
    ...state,
    revision: state.revision + 1,
  });
}

export function listTrackedTowns(): TrackedTownEdit[] {
  return Object.values(townEditsStore.get().entries);
}

/** True when any tracked town differs from its first-open baseline. */
export function hasPendingTownEdits(): boolean {
  return listTrackedTowns().some(({ town, baseline }) => diffTown(baseline, town).length > 0);
}

export function clearTownEdits(): void {
  townEditsStore.set(initialState());
}
