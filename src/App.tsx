import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Game,
  loadGame,
  groupPresentHeroes,
  presentHeroKey,
  type PresentHero,
} from './core/game';
import {
  LANG_CODES,
  Skills,
  Spells,
  WarMachines,
  SkillLevels,
  NEUTRAL_PLAYER,
  getInventoryArtifactGroups,
  getCreatureGroups,
} from './core/constants';
import { loadLangData } from './core/lang';
import { setCachedHeroes } from './core/hero-cache';
import { Hero } from './core/hero';
import type { Town } from './core/town';
import { HeroEditor } from './ui/HeroEditor';
import { TownEditor, TownList } from './ui/TownEditor';
import { ChangesSidebar } from './ui/ChangesSidebar';
import {
  clearHeroEdits,
  getTrackedHero,
  hasPendingHeroEdits,
  notifyHeroEdited,
  trackHero,
} from './stores/hero-edits';
import {
  clearTownEdits,
  getTrackedTown,
  hasPendingTownEdits,
  notifyTownEdited,
  trackTown,
} from './stores/town-edits';
import { PlayerFlag } from './ui/PlayerFlag';
import './App.css';

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
  const [openTowns, setOpenTowns] = useState<Town[]>([]);
  const [townSelection, setTownSelection] = useState<number | ''>('');
  const [heroSelection, setHeroSelection] = useState('');
  const [lastSearchKey, setLastSearchKey] = useState('');
  const [heroesLoading, setHeroesLoading] = useState(false);
  const [closePrompt, setClosePrompt] = useState<{ detail: string | null } | null>(null);
  const closeCancelRef = useRef<HTMLButtonElement>(null);

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
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    try {
      const onMap = g.listPresentHeroes();
      const all = g.listAllHeroesInSave();
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

  useEffect(() => {
    if (!closePrompt) return;
    closeCancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setClosePrompt(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closePrompt]);

  const openFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const langKey = uiLang.toLowerCase();
      const langData = await loadLangData(langKey);
      const g = await loadGame(file, langData);
      clearHeroEdits();
      clearTownEdits();
      setGame(g);
      setOpenHeroes([]);
      setOpenTowns([]);
      setTownSelection('');
      setHeroSelection('');
      setLastSearchKey('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open save');
      setGame(null);
      clearHeroEdits();
      clearTownEdits();
    } finally {
      setLoading(false);
    }
  }, [uiLang, refreshHeroLists]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) openFile(file);
  }, [openFile]);

  const resolveHeroAt = useCallback((g: Game, name: string, bytePosition: number): Hero => {
    const tracked = getTrackedHero(bytePosition);
    if (tracked) return tracked;
    const hero = new Hero(name, g, bytePosition);
    trackHero(hero);
    return hero;
  }, []);

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
      setOpenTowns([]);
      setTownSelection('');
    }

    const opened = new Set(game.heroes.map((h) => h.bytePosition));
    const positions = game.findHeroPositions(entry.name).filter((p) => {
      if (!game.isValidHeroAt(p)) return false;
      return game.getHeroPlayer(p) === entry.player;
    });
    const bytePosition = positions.find((p) => !opened.has(p));

    if (bytePosition === undefined) {
      const display = entry.player === NEUTRAL_PLAYER ? entry.name : entry.label;
      setMessage(
        game.heroes.some((h) => h.name === entry.name)
          ? `No further instances of ${display} found`
          : `Hero not found: ${display}`,
      );
      setLastSearchKey(key);
      return;
    }

    const hero = resolveHeroAt(game, entry.name, bytePosition);
    game.heroes.push(hero);
    setOpenHeroes([...game.heroes]);
    setMessage(null);
    setLastSearchKey(key);
  };

  const openTownEditor = (bytePosition: number) => {
    if (!game) return;
    const existing = getTrackedTown(bytePosition);
    const town = existing ?? game.openTown(bytePosition);
    if (!town) return;
    if (!existing) trackTown(town);
    game.openTowns = [town];
    setOpenTowns([town]);
    setTownSelection(bytePosition);
  };

  const selectTownFromSidebar = useCallback((bytePosition: number) => {
    if (!game) return;
    const town = getTrackedTown(bytePosition);
    if (!town) return;
    game.openTowns = [town];
    game.heroes = [];
    setOpenTowns([town]);
    setTownSelection(bytePosition);
    setOpenHeroes([]);
    setHeroSelection('');
    setLastSearchKey('');
    requestAnimationFrame(() => {
      document
        .getElementById(`town-editor-${bytePosition}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [game]);

  const selectHeroFromSidebar = useCallback((bytePosition: number) => {
    if (!game) return;
    const hero = getTrackedHero(bytePosition);
    if (!hero) return;
    const player = game.getHeroPlayer(bytePosition);
    const key = presentHeroKey(hero.name, player);
    setHeroSelection(key);
    setLastSearchKey(key);
    game.heroes = [hero];
    setOpenHeroes([hero]);
    setOpenTowns([]);
    setTownSelection('');
    requestAnimationFrame(() => {
      document
        .getElementById(`hero-editor-${bytePosition}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [game]);

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
    clearHeroEdits();
    clearTownEdits();
    refreshHeroLists(game);
    setOpenHeroes([]);
    setOpenTowns([]);
    setHeroSelection('');
    setTownSelection('');
    setLastSearchKey('');
  };

  const closeSave = () => {
    setClosePrompt({
      detail: hasPendingHeroEdits() || hasPendingTownEdits()
        ? 'You will lose all unsaved edits.'
        : null,
    });
  };

  const confirmCloseSave = () => {
    setClosePrompt(null);
    clearHeroEdits();
    clearTownEdits();
    setGame(null);
    setMapHeroes([]);
    setAllHeroes([]);
    setOpenHeroes([]);
    setOpenTowns([]);
    setHeroSelection('');
    setTownSelection('');
    setLastSearchKey('');
    setHeroesLoading(false);
    setMessage(null);
    setError(null);
  };

  const heroGroups = groupPresentHeroes(allHeroes);

  return (
    <div className={`app${game ? ' app-with-save' : ''}`}>
      <header className="app-header">
        <h1><abbr title="Heroes of Might and Magic III">HoMM3</abbr> Saved Game Editor</h1>
      </header>

      {!game && (
        <>
          <p className="landing-lead">
            Edit heroes and towns in a save, then download the file back to your saves folder.
          </p>
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

          <div className="landing-features">
            <section className="panel intro">
              <h2>Heroes</h2>
              <ul>
                <li>Attack, defense, spell power, knowledge, level, experience, and mana</li>
                <li>Secondary skills</li>
                <li>Army stacks</li>
                <li>War machines</li>
                <li>Equipped artifacts and backpack</li>
                <li>Spellbook and known spells</li>
              </ul>
            </section>
            <section className="panel intro">
              <h2>Towns</h2>
              <ul>
                <li>Owner</li>
                <li>Garrison stacks</li>
                <li>Hall, fortifications, and mage guild</li>
                <li>Faction dwellings, including HotA Cove, Factory, and Bulwark</li>
                <li>Tavern, blacksmith, marketplace, resource silo, shipyard, and grail</li>
                <li>Mage guild spells</li>
              </ul>
            </section>
          </div>

          <section className="panel intro">
            <h2>A look at the editor</h2>
            <div className="preview-gallery">
              <figure>
                <img
                  src={`${import.meta.env.BASE_URL}preview/overview.png`}
                  alt="A loaded HotA save, with hero and town pickers and the Changes sidebar"
                />
                <figcaption>Open a save, then pick a hero or a town. Edits collect in Changes.</figcaption>
              </figure>
              <figure>
                <img
                  src={`${import.meta.env.BASE_URL}preview/town.png`}
                  alt="Town editor for Noral, a Cove town, including dwellings such as the Frigate"
                />
                <figcaption>Towns: owner, garrison, buildings, and that faction&apos;s dwellings.</figcaption>
              </figure>
              <figure>
                <img
                  src={`${import.meta.env.BASE_URL}preview/hero.png`}
                  alt="Hero editor for Corkes, with stats, secondary skills, army, and war machines"
                />
                <figcaption>Heroes: stats, skills, army, war machines, artifacts, and spellbook.</figcaption>
              </figure>
            </div>
          </section>

          <section className="panel intro">
            <h2>Supported games &amp; files</h2>
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
        </>
      )}

      {error && <div className="banner error">{error}</div>}
      {message && <div className="banner info">{message}</div>}

      {game && (
        <div className="app-shell">
          <div className="app-main">
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
            </section>

            <section className="panel entity-search">
              <div className="entity-search-row">
                <div className="entity-search-field">
                  <h2>Heroes</h2>
                  {heroesLoading ? (
                    <p className="hint heroes-loading" aria-live="polite">
                      Scanning save for heroes…
                    </p>
                  ) : allHeroes.length > 0 ? (
                    <>
                      <div className="row">
                        <select
                          value={heroSelection}
                          onChange={(e) => {
                            const key = e.target.value;
                            setHeroSelection(key);
                            searchHero(key);
                          }}
                        >
                          <option value="">Select a hero…</option>
                          {heroGroups.map((group) => (
                            <optgroup key={group.label} label={group.label}>
                              {group.heroes.map((h) => (
                                <option key={h.key} value={h.key}>{h.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        {heroSelection && (
                          <PlayerFlag player={Number(heroSelection.slice(heroSelection.lastIndexOf('|') + 1))} />
                        )}
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
                </div>

                <div className="entity-search-field">
                  <h2>Towns</h2>
                  <TownList
                    towns={game.towns}
                    selection={townSelection}
                    onSelect={openTownEditor}
                  />
                </div>
              </div>
            </section>

            {openTowns.slice(0, 1).map((town) => (
              <TownEditor
                key={town.bytePosition}
                town={town}
                spells={Spells.names}
                creatureGroups={creatureGroups}
                onChange={notifyTownEdited}
              />
            ))}

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
                onChange={notifyHeroEdited}
              />
            ))}
          </div>

          <ChangesSidebar
            uiLang={uiLang}
            langCodes={LANG_CODES}
            loading={loading}
            onUiLangChange={changeUiLang}
            onDownload={saveGame}
            onClose={closeSave}
            onSelectHero={selectHeroFromSidebar}
            onSelectTown={selectTownFromSidebar}
            playerForHero={(bytePosition) => game.getHeroPlayer(bytePosition)}
          />
        </div>
      )}

      {closePrompt && (
        <div
          className="confirm-backdrop"
          onClick={() => setClosePrompt(null)}
        >
          <div
            className="panel confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-save-title"
            aria-describedby={closePrompt.detail ? 'close-save-detail' : undefined}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="close-save-title">Close this save?</h2>
            {closePrompt.detail && <p id="close-save-detail">{closePrompt.detail}</p>}
            <div className="confirm-actions">
              <button
                type="button"
                ref={closeCancelRef}
                onClick={() => setClosePrompt(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-danger"
                onClick={confirmCloseSave}
              >
                Close save
              </button>
            </div>
          </div>
        </div>
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
