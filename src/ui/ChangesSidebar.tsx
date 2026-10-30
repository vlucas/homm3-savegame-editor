import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { heroEditsStore } from '../stores/hero-edits';
import { townEditsStore } from '../stores/town-edits';
import { diffHero } from '../core/hero-diff';
import { diffTown } from '../core/town-diff';
import { PlayerFlag } from './PlayerFlag';

interface Props {
  uiLang: string;
  langCodes: readonly string[];
  loading?: boolean;
  onUiLangChange: (lang: string) => void;
  onDownload: () => void;
  onClose: () => void;
  onSelectHero: (bytePosition: number) => void;
  onSelectTown: (bytePosition: number) => void;
  playerForHero: (bytePosition: number) => number;
}

export function ChangesSidebar({
  uiLang,
  langCodes,
  loading = false,
  onUiLangChange,
  onDownload,
  onClose,
  onSelectHero,
  onSelectTown,
  playerForHero,
}: Props) {
  const heroState = useStore(heroEditsStore);
  const townState = useStore(townEditsStore);

  // `revision` forces a fresh diff after in-place mutations.
  const heroGroups = useMemo(() => {
    const revision = heroState.revision;
    return Object.values(heroState.entries)
      .map(({ hero, baseline }) => ({
        hero,
        lines: diffHero(baseline, hero),
        revision,
      }))
      .filter((g) => g.lines.length > 0)
      .sort((a, b) =>
        a.hero.name.localeCompare(b.hero.name, undefined, { sensitivity: 'base' })
        || a.hero.bytePosition - b.hero.bytePosition,
      );
  }, [heroState.entries, heroState.revision]);

  const townGroups = useMemo(() => {
    const revision = townState.revision;
    return Object.values(townState.entries)
      .map(({ town, baseline }) => ({
        town,
        lines: diffTown(baseline, town),
        revision,
      }))
      .filter((g) => g.lines.length > 0)
      .sort((a, b) =>
        a.town.name.localeCompare(b.town.name, undefined, { sensitivity: 'base' })
        || a.town.bytePosition - b.town.bytePosition,
      );
  }, [townState.entries, townState.revision]);

  const heroNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of heroGroups) {
      counts.set(g.hero.name, (counts.get(g.hero.name) ?? 0) + 1);
    }
    return counts;
  }, [heroGroups]);

  const townNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of townGroups) {
      counts.set(g.town.name, (counts.get(g.town.name) ?? 0) + 1);
    }
    return counts;
  }, [townGroups]);

  return (
    <aside className="app-sidebar" aria-label="Save controls and edit preview">
      <label className="sidebar-lang">
        UI language
        <select value={uiLang} onChange={(e) => onUiLangChange(e.target.value)}>
          {langCodes.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </label>

      <div className="changes-sidebar panel">
        <div className="changes-header">
          <h2>Changes</h2>
          <button
            type="button"
            className="button-danger button-close-save"
            onClick={onClose}
          >
            Close save
          </button>
        </div>

        <div className="changes-body">
          {heroGroups.length === 0 && townGroups.length === 0 ? (
            <p className="hint">No edits yet</p>
          ) : (
            <div className="changes-list">
              {heroGroups.map(({ hero, lines }) => {
                const showPos = (heroNameCounts.get(hero.name) ?? 0) > 1;
                return (
                  <section key={`hero-${hero.bytePosition}`} className="changes-hero">
                    <button
                      type="button"
                      className="changes-hero-title"
                      onClick={() => onSelectHero(hero.bytePosition)}
                    >
                      <span>
                        Hero &apos;{hero.name}&apos;
                        {showPos && (
                          <span className="meta"> @ 0x{hero.bytePosition.toString(16)}</span>
                        )}
                      </span>
                      <PlayerFlag player={playerForHero(hero.bytePosition)} />
                    </button>
                    <ul>
                      {lines.map((line) => (
                        <li key={`${line.category}:${line.text}`}>
                          {line.category}: {line.text}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
              {townGroups.map(({ town, lines }) => {
                const showPos = (townNameCounts.get(town.name) ?? 0) > 1;
                return (
                  <section key={`town-${town.bytePosition}`} className="changes-hero">
                    <button
                      type="button"
                      className="changes-hero-title"
                      onClick={() => onSelectTown(town.bytePosition)}
                    >
                      <span>
                        Town &apos;{town.name}&apos;
                        {showPos && (
                          <span className="meta"> @ 0x{town.bytePosition.toString(16)}</span>
                        )}
                      </span>
                      <PlayerFlag player={town.owner} />
                    </button>
                    <ul>
                      {lines.map((line) => (
                        <li key={`${line.category}:${line.text}`}>
                          {line.category}: {line.text}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          className="button-download"
          onClick={onDownload}
          disabled={loading}
        >
          <svg
            className="button-download-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="currentColor"
              d="M12 3a1 1 0 0 1 1 1v9.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L11 13.59V4a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"
            />
          </svg>
          Download edited save
        </button>
      </div>
    </aside>
  );
}
