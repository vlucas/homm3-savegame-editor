import { useCallback, useEffect, useMemo, useState } from 'react';
import { Game, loadGame, groupPresentHeroes, formatPlayerLabel, type PresentHero } from './core/game';
import { Heroes, LANG_CODES, Skills, Spells, WarMachines, SkillLevels, NEUTRAL_PLAYER, getInventoryArtifactGroups, getCreatureGroups } from './core/constants';
import { loadLangData } from './core/lang';
import { setCachedHeroes } from './core/hero-cache';
import type { Hero } from './core/hero';
import { HeroEditor } from './ui/HeroEditor';
import './App.css';

const ALL_PLAYERS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

function downloadBlob(data: Uint8Array, fileName: string) {
  const blob = new Blob([new Uint8Array(data)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uiLang, setUiLang] = useState('EN');
  const [message, setMessage] = useState<string | null>(null);
  const [mapHeroes, setMapHeroes] = useState<PresentHero[]>([]);
  const [allHeroes, setAllHeroes] = useState<PresentHero[]>([]);
  const [openHeroes, setOpenHeroes] = useState<Hero[]>([]);
  const [heroSelection, setHeroSelection] = useState('');
  const [lastSearchKey, setLastSearchKey] = useState('');
  const [playerFilter, setPlayerFilter] = useState<Set<number>>(() => new Set());
  const [heroesLoading, setHeroesLoading] = useState(false);

  const inventoryArtifactGroups = useMemo(
    () => (game ? getInventoryArtifactGroups() : []),
    [game, uiLang],
  );

  const creatureGroups = useMemo(
    () => (game
      ? getCreatureGroups({
        isHota: game.isHOTA,
        withBulwark: game.version.minor >= 10,
      })
      : []),
    [game, uiLang],
  );

  const refreshHeroLists = useCallback(async (g: Game) => {
    setHeroesLoading(true);
    setMapHeroes([]);
    setAllHeroes([]);
    // Yield so React can paint the loading message before the scan blocks.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      const onMap = g.listPresentHeroes(Heroes.names);
      const all = g.listAllHeroesInSave(Heroes.names);
      setMapHeroes(onMap);
      setAllHeroes(all);
      setCachedHeroes(g, onMap);
    } finally {
      setHeroesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!game) return;
    void refreshHeroLists(game);
  }, [game, uiLang, refreshHeroLists]);

  const openFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const langKey = uiLang.toLowerCase();
      const langData = await loadLangData(langKey);
      const g = await loadGame(file, langData);
      setGame(g);
      setOpenHeroes([]);
      setHeroSelection('');
      setLastSearchKey('');
      setPlayerFilter(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open save');
      setGame(null);
    } finally {
      setLoading(false);
    }
  }, [uiLang, refreshHeroLists]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) openFile(file);
  }, [openFile]);

  const searchHero = (key: string) => {
    if (!game || !key) return;
    const entry = allHeroes.find((h) => h.key === key);
    if (!entry) {
      setMessage('Hero not found in save');
      return;
    }

    const continuingDuplicates = key === lastSearchKey && openHeroes.length > 0;
    if (!continuingDuplicates) {
      game.heroes = [];
      setOpenHeroes([]);
    }

    const ok = game.searchHero(entry.name, entry.player);
    if (ok) {
      setOpenHeroes([...game.heroes]);
      setMessage(null);
    } else {
      const display = entry.player === NEUTRAL_PLAYER ? entry.name : entry.label;
      setMessage(
        game.heroes.some((h) => h.name === entry.name)
          ? `No further instances of ${display} found`
          : `Hero not found: ${display}`,
      );
    }
    setLastSearchKey(key);
  };

  const saveGame = async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
    try {
      const data = await game.exportCompressed();
      downloadBlob(data, game.fileName);
      setMessage('Save downloaded');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  const changeUiLang = async (lang: string) => {
    setUiLang(lang);
    if (!game) return;
    const langData = await loadLangData(lang.toLowerCase());
    game.applyLang(langData);
    refreshHeroLists(game);
    setOpenHeroes([]);
    setHeroSelection('');
    setLastSearchKey('');
  };

  const closeSave = () => {
    if (!window.confirm('Close this save and discard unsaved changes?')) return;
    setGame(null);
    setMapHeroes([]);
    setAllHeroes([]);
    setOpenHeroes([]);
    setHeroSelection('');
    setLastSearchKey('');
    setPlayerFilter(new Set());
    setHeroesLoading(false);
    setMessage(null);
    setError(null);
  };

  const togglePlayerFilter = (player: number) => {
    setPlayerFilter((prev) => {
      const next = new Set(prev);
      if (next.has(player)) next.delete(player);
      else next.add(player);
      return next;
    });
  };

  const filteredHeroes = useMemo(() => {
    if (playerFilter.size === 0) return allHeroes;
    return allHeroes.filter((h) => playerFilter.has(h.player));
  }, [allHeroes, playerFilter]);

  const heroGroups = groupPresentHeroes(filteredHeroes);

  useEffect(() => {
    if (heroSelection && !filteredHeroes.some((h) => h.key === heroSelection)) {
      setHeroSelection('');
    }
  }, [filteredHeroes, heroSelection]);

  return (
    <div className="app">
      <header className="app-header">
        <h1><abbr title="Heroes of Might and Magic III">HoMM3</abbr> Saved Game Editor</h1>
      </header>

      {!game && (
        <>
          <section className="panel intro">
            <h2>Edit your heroes</h2>
            <p>
              Open a Heroes of Might and Magic III save and change hero stats, secondary skills,
              army stacks, war machines, artifacts, inventory, and known spells. Download the
              edited save when you are done and put it back in your saves folder.
            </p>

            <h3>Supported games &amp; files</h3>
            <ul>
              <li>Classic expansions (Restoration of Erathia, Armageddon&apos;s Blade, Shadow of Death, and related builds)</li>
              <li>Horn of the Abyss (HotA), including Cove, Factory, and Bulwark content where the save version supports it</li>
              <li>Save types: <code>.GM1</code>, <code>.GM2</code>, and campaign <code>.CGM</code></li>
            </ul>

            <h3>Things that can go wrong</h3>
            <ul>
              <li>
                Combination artifacts (Angelic Alliance, Armor of the Damned, Power of the Dragon
                Father, and similar) block multiple equipment slots. Equipping or removing them
                incorrectly can leave blocked slots, missing pieces, or a save the game refuses to load.
              </li>
              <li>
                Safer option: put the finished combination artifact in the hero&apos;s backpack
                (inventory) instead of equipping it in a gear slot. The hero can equip it in-game
                so the game handles slot blocking correctly.
              </li>
              <li>
                Keep a backup of the original save before downloading an edited one.
              </li>
            </ul>
          </section>

          <section
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
          >
            <input
              type="file"
              accept=".cgm,.gm1,.gm2,*.*gm"
              onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])}
            />
            <p>{loading ? 'Loading…' : '⬆️ Drop a .CGM / .GM1 / .GM2 save or click to browse'}</p>
          </section>
        </>
      )}

      {error && <div className="banner error">{error}</div>}
      {message && <div className="banner info">{message}</div>}

      {game && (
        <>
          <section className="panel game-info">
            <h2>Save Info</h2>
            <dl>
              <dt>File</dt><dd>{game.fileName}</dd>
              <dt>Map</dt><dd>{game.mapName || '—'}</dd>
              <dt>Version</dt><dd>{game.versionText}</dd>
              <dt>Language</dt><dd>{game.lang.toUpperCase()}</dd>
              <dt>Towns found</dt><dd>{game.towns.length}</dd>
              <dt>Heroes on map</dt><dd>{mapHeroes.length}</dd>
            </dl>
            <div className="row">
              <label>
                UI language
                <select value={uiLang} onChange={(e) => changeUiLang(e.target.value)}>
                  {LANG_CODES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <button type="button" onClick={saveGame} disabled={loading}>Download edited save</button>
              <button type="button" className="button-danger" onClick={closeSave}>
                Close save
              </button>
            </div>
          </section>

          <section className="panel hero-search">
            <h2>Find Hero</h2>
            {heroesLoading ? (
              <p className="hint heroes-loading" aria-live="polite">
                Scanning save for heroes…
              </p>
            ) : allHeroes.length > 0 ? (
              <>
                <div className="player-filter row" role="group" aria-label="Filter by player">
                  {ALL_PLAYERS.map((player) => (
                    <label key={player} className="check">
                      <input
                        type="checkbox"
                        checked={playerFilter.has(player)}
                        onChange={() => togglePlayerFilter(player)}
                      />
                      {formatPlayerLabel(player)}
                    </label>
                  ))}
                </div>
                <div className="row">
                  <select
                    value={heroSelection}
                    onChange={(e) => {
                      const key = e.target.value;
                      setHeroSelection(key);
                      searchHero(key);
                    }}
                    disabled={filteredHeroes.length === 0}
                  >
                    <option value="">
                      {filteredHeroes.length === 0 ? 'No heroes for selected players…' : 'Select a hero…'}
                    </option>
                    {heroGroups.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.heroes.map((h) => (
                          <option key={h.key} value={h.key}>{h.name}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => searchHero(heroSelection)}
                    disabled={!heroSelection}
                  >
                    Find next
                  </button>
                </div>
                <p className="hint">Use Find next to open another instance of the selected hero.</p>
              </>
            ) : (
              <p className="hint">No heroes detected in this save.</p>
            )}
          </section>

          {openHeroes.map((hero, idx) => (
            <HeroEditor
              key={`${hero.name}-${hero.bytePosition}-${idx}`}
              hero={hero}
              skills={Skills.names}
              skillLevels={SkillLevels.names}
              spells={Spells.names}
              creatureGroups={creatureGroups}
              inventoryArtifactGroups={inventoryArtifactGroups}
              warMachines={WarMachines.originalNames}
            />
          ))}
        </>
      )}

      <footer className="app-footer">
        <p>
          This is a port of{' '}
          <a
            href="https://github.com/AlexSnowLeo/Heroes3Editor"
            target="_blank"
            rel="noopener noreferrer"
          >
            Heroes3Editor
          </a>
          {' '}for Windows.
        </p>
        <p>
          Made by{' '}
          <a
            href="https://vancelucas.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vance Lucas
          </a>.

          Source code on {' '}
          <a
            href="https://github.com/vlucas/homm3-savegame-editor"
            target="_blank"
            rel="noopener noreferrer"
          >
          GitHub
          </a>.
        </p>
      </footer>
    </div>
  );
}
