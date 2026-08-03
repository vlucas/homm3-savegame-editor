import { useCallback, useState } from 'react';
import { Game, loadGame } from './core/game';
import { loadLangData } from './core/lang';
import { Heroes, LANG_CODES, Skills, Spells, Creatures, Artifacts, WarMachines, SkillLevels } from './core/constants';
import { HeroEditor } from './ui/HeroEditor';
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
  const [heroQuery, setHeroQuery] = useState('');
  const [uiLang, setUiLang] = useState('EN');
  const [message, setMessage] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((r) => r + 1);

  const openFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const langKey = uiLang.toLowerCase();
      const langData = await loadLangData(langKey);
      const g = await loadGame(file, langData);
      setGame(g);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open save');
      setGame(null);
    } finally {
      setLoading(false);
    }
  }, [uiLang]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) openFile(file);
  }, [openFile]);

  const searchHero = () => {
    if (!game || !heroQuery.trim()) return;
    const ok = game.searchHero(heroQuery.trim());
    setMessage(ok ? `Found hero: ${heroQuery}` : `Hero not found: ${heroQuery}`);
    bump();
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
    bump();
  };

  const heroOptions = Heroes.names.filter((h) => game && game.searchHeroExt(h) > 0);

  return (
    <div className="app">
      <header className="app-header">
        <h1>HoMM3 Savegame Editor</h1>
        <p className="tagline">Client-side editor — your saves never leave the browser</p>
      </header>

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
        <p>{loading ? 'Loading…' : 'Drop a .CGM / .GM1 save or click to browse'}</p>
      </section>

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
            </dl>
            <div className="row">
              <label>
                UI language
                <select value={uiLang} onChange={(e) => changeUiLang(e.target.value)}>
                  {LANG_CODES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <button type="button" onClick={saveGame} disabled={loading}>Download edited save</button>
            </div>
          </section>

          <section className="panel hero-search">
            <h2>Find Hero</h2>
            <div className="row">
              <input
                list="hero-list"
                value={heroQuery}
                onChange={(e) => setHeroQuery(e.target.value)}
                placeholder="Hero name"
              />
              <datalist id="hero-list">
                {heroOptions.map((h) => <option key={h} value={h} />)}
              </datalist>
              <button type="button" onClick={searchHero}>Search</button>
            </div>
            <p className="hint">Search the same name again to find duplicate instances.</p>
          </section>

          {game.heroes.map((hero, idx) => (
            <HeroEditor
              key={`${hero.name}-${hero.bytePosition}-${idx}-${revision}`}
              hero={hero}
              skills={Skills.names}
              skillLevels={SkillLevels.names}
              spells={Spells.names}
              creatures={Creatures.names}
              artifacts={[...Artifacts.names]}
              warMachines={WarMachines.originalNames}
            />
          ))}
        </>
      )}
    </div>
  );
}
