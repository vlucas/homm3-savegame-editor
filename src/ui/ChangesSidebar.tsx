import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { heroEditsStore } from '../stores/hero-edits';
import { diffHero } from '../core/hero-diff';

interface Props {
  uiLang: string;
  langCodes: readonly string[];
  loading?: boolean;
  onUiLangChange: (lang: string) => void;
  onDownload: () => void;
  onClose: () => void;
  onSelectHero: (bytePosition: number) => void;
}

export function ChangesSidebar({
  uiLang,
  langCodes,
  loading = false,
  onUiLangChange,
  onDownload,
  onClose,
  onSelectHero,
}: Props) {
  const state = useStore(heroEditsStore);

  // `revision` forces a fresh diff after in-place Hero mutations.
  const groups = useMemo(() => {
    const revision = state.revision;
    return Object.values(state.entries)
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
  }, [state.entries, state.revision]);

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of groups) {
      counts.set(g.hero.name, (counts.get(g.hero.name) ?? 0) + 1);
    }
    return counts;
  }, [groups]);

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
          {groups.length === 0 ? (
            <p className="hint">No edits yet</p>
          ) : (
            <div className="changes-list">
              {groups.map(({ hero, lines }) => {
                const showPos = (nameCounts.get(hero.name) ?? 0) > 1;
                return (
                  <section key={hero.bytePosition} className="changes-hero">
                    <button
                      type="button"
                      className="changes-hero-title"
                      onClick={() => onSelectHero(hero.bytePosition)}
                    >
                      Hero &apos;{hero.name}&apos;
                      {showPos && (
                        <span className="meta"> @ 0x{hero.bytePosition.toString(16)}</span>
                      )}
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
