import { useEffect, useRef, useState } from 'react';
import {
  Anchor, ArrowDownToLine, ArrowUpRight, Check, ChevronDown, ChevronRight,
  Compass, Copy, Focus, FolderOpen, Grid2X2, HelpCircle, Layers3, Maximize2,
  MousePointer2, Move3D, PanelLeftClose, Plus, RotateCcw, Sailboat,
  Save, SlidersHorizontal, Sparkles, Waves, Wind, X,
} from 'lucide-react';
import BoatScene, { CameraView, SceneHandle } from './BoatScene';
import { Design, HullType, NumericKey, indicators, limits, parseDesign, presets } from './design';

type Tab = 'hull' | 'rig' | 'sails';
const typeNames: Record<HullType, string> = { mono: 'Monohull', cat: 'Katamaran', tri: 'Trimaran' };
const storageKey = 'sailor-studio.design.v1';
const format = (n: number, decimals = 1) => n.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

function HullIcon({ type, small = false }: { type: HullType; small?: boolean }) {
  const centers = type === 'mono' ? [30] : type === 'cat' ? [19, 41] : [12, 30, 48];
  return <svg width={small ? 28 : 52} height={small ? 30 : 52} viewBox="0 0 60 60" fill="none" aria-hidden="true">
    {type !== 'mono' && <><path d="M12 27H48M12 38H48" stroke="currentColor" strokeWidth="2" opacity=".5" /></>}
    {centers.map((x, i) => <path key={x} d={`M${x} 7 Q${x - 8} 17 ${x - 6} 45 Q${x} 53 ${x + 6} 45 Q${x + 8} 17 ${x} 7Z`}
      stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity={type === 'tri' && i !== 1 ? '.07' : '.13'} />)}
  </svg>;
}

function Slider({ label, value, unit, min, max, step = 0.1, onChange, caption }: {
  label: string; value: number; unit: string; min: number; max: number; step?: number;
  onChange(value: number): void; caption?: string;
}) {
  const id = `control-${label.replaceAll(' ', '-')}`;
  return <div className="slider-control">
    <div className="slider-label"><label htmlFor={id}>{label}</label><span>{format(value, step >= 1 ? 0 : 1)} <small>{unit}</small></span></div>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
      style={{ '--fill': `${(value - min) / (max - min) * 100}%` } as React.CSSProperties} />
    <div className="slider-scale"><span>{min} {unit}</span><span>{max} {unit}</span></div>
    {caption && <p className="control-caption">{caption}</p>}
  </div>;
}

function download(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [design, setDesign] = useState<Design>({ ...presets[0] });
  const [tab, setTab] = useState<Tab>('hull');
  const [view, setView] = useState<CameraView>('perspective');
  const [wireframe, setWireframe] = useState(false);
  const [water, setWater] = useState(true);
  const [dimensions, setDimensions] = useState(true);
  const [sidebar, setSidebar] = useState(true);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [modal, setModal] = useState<'help' | 'new' | null>(null);
  const [saved, setSaved] = useState(false);
  const [undo, setUndo] = useState<Design[]>([]);
  const [redo, setRedo] = useState<Design[]>([]);
  const [restored, setRestored] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const scene = useRef<SceneHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const modalElement = useRef<HTMLElement>(null);
  const gesture = useRef<Design | null>(null);
  const data = indicators(design);
  const notify = (message: string, error = false) => setToast({ message, error });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setDesign(parseDesign(stored));
    } catch (error) {
      setAutoSave(false);
      notify(`Lokaler Entwurf konnte nicht geladen werden: ${error instanceof Error ? error.message : String(error)} Bitte öffnen oder neu beginnen.`, true);
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored || !autoSave) return;
    const timer = setTimeout(() => {
      if (!design.name.trim()) {
        notify('Automatische Sicherung pausiert: Bitte gib deinem Entwurf einen Namen.', true);
        return;
      }
      try { localStorage.setItem(storageKey, JSON.stringify(design)); }
      catch (error) {
        setAutoSave(false);
        notify(`Automatisches Speichern fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`, true);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [design, restored, autoSave]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    window.addEventListener('pointerup', endGesture);
    window.addEventListener('pointercancel', endGesture);
    return () => {
      window.removeEventListener('pointerup', endGesture);
      window.removeEventListener('pointercancel', endGesture);
    };
  }, [design]);
  useEffect(() => {
    if (!modal) return;
    const previousFocus = document.activeElement;
    const element = modalElement.current!;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
      if (event.key !== 'Tab') return;
      const buttons = element.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [modal]);

  function change(next: Design) {
    if (JSON.stringify(next) === JSON.stringify(design)) return;
    if (!gesture.current) setUndo(previous => [...previous.slice(-49), design]);
    setRedo([]);
    setDesign(next);
    setSaved(false);
  }
  function numeric(key: NumericKey, value: number) {
    change({ ...design, [key]: value });
  }
  function startGesture() { gesture.current = design; }
  function endGesture() {
    if (gesture.current && JSON.stringify(gesture.current) !== JSON.stringify(design)) {
      const before = gesture.current;
      setUndo(previous => [...previous.slice(-49), before]);
    }
    gesture.current = null;
  }
  function undoChange() {
    if (!undo.length) return;
    setRedo(previous => [...previous, design]);
    setDesign(undo[undo.length - 1]);
    setUndo(undo.slice(0, -1));
    setSaved(false);
  }
  function redoChange() {
    if (!redo.length) return;
    setUndo(previous => [...previous, design]);
    setDesign(redo[redo.length - 1]);
    setRedo(redo.slice(0, -1));
    setSaved(false);
  }
  function load(text: string) {
    change(parseDesign(text));
    setAutoSave(true);
    notify('Entwurf geöffnet. Willkommen zurück an Bord.');
  }
  async function open() {
    try {
      if (window.sailor) {
        const text = await window.sailor.open();
        if (text !== null) load(text);
      } else fileInput.current?.click();
    } catch (error) { notify(`Öffnen fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`, true); }
  }
  async function save() {
    try {
      if (!design.name.trim()) throw new Error('Bitte gib deinem Entwurf einen Namen.');
      const text = JSON.stringify(parseDesign(JSON.stringify(design)), null, 2);
      if (window.sailor) {
        if (!await window.sailor.save(text)) return;
      } else download(text, `${design.name}.sailor.json`, 'application/json');
      setSaved(true);
      notify('Entwurf als Datei gespeichert.');
    } catch (error) { notify(`Speichern fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`, true); }
  }
  async function capture() {
    try {
      if (!scene.current) throw new Error('Die 3D-Ansicht ist noch nicht bereit.');
      const image = scene.current.capture();
      if (window.sailor) {
        if (!await window.sailor.saveImage(image)) return;
      } else {
        const a = document.createElement('a');
        a.href = image;
        a.download = `${design.name}-ansicht.png`;
        a.click();
      }
      notify('3D-Ansicht als PNG exportiert.');
    } catch (error) { notify(`Bildexport fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`, true); }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewport.current?.requestFullscreen();
    } catch (error) { notify(`Vollbild nicht verfügbar: ${error instanceof Error ? error.message : String(error)}`, true); }
  }
  function usePreset(preset: Design) {
    change({ ...preset });
    setAutoSave(true);
    setModal(null);
    setView('perspective');
    notify(`${preset.name} ist bereit für deine Ideen.`);
  }
  const slider = (key: NumericKey, label: string, unit: string, step = 0.1, caption?: string) =>
    <Slider label={label} value={design[key]} unit={unit} min={limits[key][0]} max={limits[key][1]} step={step}
      onChange={value => numeric(key, value)} caption={caption} />;

  return <div className={`app ${sidebar ? '' : 'sidebar-hidden'}`}>
    <aside className="sidebar">
      <a className="brand" href="#studio" aria-label="Sailor Studio Start"><span className="brand-icon"><Sailboat size={26} strokeWidth={1.6} /></span><span>SAILOR<small>DESIGN STUDIO</small></span></a>
      <div className="workspace-label">DEIN WORKSPACE <span>01</span></div>
      <button className="nav-item selected" onClick={() => setModal(null)}><Compass size={18} /> Design Studio <span className="nav-dot" /></button>
      <button className="nav-item" onClick={open}><FolderOpen size={18} /> Entwurf öffnen <ArrowUpRight size={14} /></button>
      <button className="nav-item" onClick={() => setModal('new')}><Layers3 size={18} /> Konzeptbibliothek <span className="nav-count">3</span></button>
      <div className="sidebar-divider" />
      <div className="workspace-label">STARTPUNKTE <Sparkles size={13} /></div>
      <div className="preset-list">{presets.map((preset, index) => <button key={preset.type} className={`preset-item ${design.type === preset.type ? 'active' : ''}`} onClick={() => usePreset(preset)}>
        <span className={`preset-icon preset-${preset.type}`}><HullIcon type={preset.type} small /></span>
        <span><strong>{preset.name}</strong><small>{typeNames[preset.type]} · {format(preset.length)} m</small></span>
        <ChevronRight size={14} /><span className="sr-only">Vorlage {index + 1} laden</span>
      </button>)}</div>
      <button className="new-design" onClick={() => setModal('new')}><Plus size={16} /> Neuer Entwurf</button>
      <div className="sidebar-bottom">
        <div className="inspiration"><span className="inspiration-icon"><Wind size={20} /></span><strong>Jeder Horizont beginnt<br />mit einer Idee.</strong><p>Dein Boot. Deine Linien.<br />Dein nächstes Abenteuer.</p><span className="mini-wave">~ ~ ~</span></div>
        <button className="help-button" onClick={() => setModal('help')}><HelpCircle size={17} /> Anleitung & Hinweise <ArrowUpRight size={14} /></button>
        <div className="profile"><span className="avatar">DS</span><span>Dein Designstudio<small>LOCAL WORKSPACE</small></span><span className="online-dot" /></div>
      </div>
    </aside>

    <header className="topbar">
      <div className="breadcrumb"><button className="icon-button sidebar-toggle" title="Seitenleiste umschalten" onClick={() => setSidebar(!sidebar)}><PanelLeftClose size={18} /></button><span>Workspace</span><ChevronRight size={13} /><strong>Design Studio</strong></div>
      <div className="top-actions"><span className="local-badge"><span /> Lokal & privat</span><button className="button subtle" onClick={capture}><ArrowDownToLine size={15} /> Bildexport</button><button className="button primary" onClick={save}>{saved ? <Check size={16} /> : <Save size={16} />}{saved ? 'Gespeichert' : 'Entwurf speichern'}</button></div>
    </header>

    <main id="studio">
      <div className="page-heading"><div><div className="eyebrow">VOM GEDANKEN ZUR WASSERLINIE</div><h1>Design your horizon<span>.</span></h1><p>Entwirf ein Segelboot, das deine Handschrift trägt.</p></div><div className="studio-tag"><span /><span>KONZEPTMODUS<small>Ideen frei entfalten</small></span></div></div>
      <div className="designer-layout">
        <section className="canvas-panel">
          <div className="canvas-header"><div className="design-title"><span className="design-symbol"><Sailboat size={19} /></span><div><input aria-label="Entwurfsname" maxLength={60} value={design.name} onChange={e => change({ ...design, name: e.target.value })} /><small>{typeNames[design.type]} <span> / </span> Konzeptentwurf</small></div><span className="revision">V1</span></div><div className="history-actions"><button className="icon-button" title="Rückgängig" disabled={!undo.length} onClick={undoChange}><RotateCcw size={17} /></button><button className="icon-button redo" title="Wiederholen" disabled={!redo.length} onClick={redoChange}><RotateCcw size={17} /></button><span /><button className="icon-button" title="Entwurf duplizieren" onClick={() => { change({ ...design, name: `${design.name.slice(0, 52)} Kopie` }); notify('Arbeitskopie erstellt. Zum Behalten als Datei speichern.'); }}><Copy size={16} /></button></div></div>
          <div className="viewport" ref={viewport}>
            <BoatScene ref={scene} design={design} view={view} wireframe={wireframe} water={water} />
            <div className="viewport-top"><span className="live-badge"><span /> LIVE PREVIEW</span><span className="viewport-caption">PARAMETRIC DESIGN / 01</span></div>
            <div className="view-selector">{([['perspective', '3D'], ['side', 'Seite'], ['top', 'Deck'], ['front', 'Bug']] as const).map(([key, label]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{key === 'perspective' && <Move3D size={13} />}{label}</button>)}</div>
            <div className="viewport-tools">
              <button title="Ansicht zentrieren" onClick={() => scene.current?.reset()}><Focus size={18} /></button>
              <button title="Wasserfläche umschalten" className={water ? 'active' : ''} onClick={() => setWater(!water)}><Waves size={18} /></button>
              <button title="Maße einblenden" className={dimensions ? 'active' : ''} onClick={() => setDimensions(!dimensions)}><SlidersHorizontal size={18} /></button>
              <span /><button title="Vollbild" onClick={fullscreen}><Maximize2 size={17} /></button>
            </div>
            {dimensions && <div className="dimension-readout"><span>LÄNGE ÜBER ALLES</span><div><i /><strong>{format(design.length)} m</strong><i /></div><small>B {format(design.beam)} m <span>·</span> T {format(design.draft)} m</small></div>}
            <div className="axis-widget"><span className="axis-y">Y</span><span className="axis-z">Z</span><span className="axis-x">X</span><svg width="60" height="55"><path d="M28 32V7M28 32L51 43M28 32L6 43" stroke="#839bad" /><circle cx="28" cy="32" r="3" fill="#f4f9fa" /></svg></div>
            <div className="viewport-bottom"><span><MousePointer2 size={13} /> Ziehen zum Drehen <span>·</span> Scrollen zum Zoomen <span>·</span> Rechtsziehen zum Verschieben</span><span className="render-status"><span /> ECHTZEIT 3D</span></div>
          </div>
          <div className="canvas-footer"><div className="render-modes"><button className={!wireframe ? 'active' : ''} onClick={() => setWireframe(false)}><Layers3 size={14} /> Studio</button><button className={wireframe ? 'active' : ''} onClick={() => setWireframe(true)}><Grid2X2 size={14} /> Drahtmodell</button></div><span><span className="small-dot" /> Änderungen direkt sichtbar</span></div>
        </section>

        <aside className="inspector">
          <div className="inspector-heading"><div><SlidersHorizontal size={17} /><strong>Designparameter</strong></div><button className="icon-button" title="Aktuelle Vorlage zurücksetzen" onClick={() => usePreset(presets.find(p => p.type === design.type)!)}><RotateCcw size={15} /></button></div>
          <div className="inspector-tabs">{([['hull', 'Rumpf'], ['rig', 'Rigg'], ['sails', 'Segel']] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={tab === key ? 'active' : ''}>{label}</button>)}</div>
          <div className="inspector-content" onPointerDown={event => { if (event.target instanceof HTMLInputElement && event.target.type === 'range') startGesture(); }} onPointerUp={endGesture} onPointerCancel={endGesture} onBlur={endGesture}>
            {tab === 'hull' && <>
              <div className="section-label">01 <span>RUMPFKONZEPT</span></div>
              <div className="hull-options">{(['mono', 'cat', 'tri'] as const).map(type => <button key={type} aria-pressed={design.type === type} className={design.type === type ? 'active' : ''} onClick={() => change({ ...design, type })}><HullIcon type={type} /><span>{type === 'mono' ? 'Mono' : type === 'cat' ? 'Katamaran' : 'Trimaran'}</span>{design.type === type && <span className="option-check"><Check size={10} /></span>}</button>)}</div>
              <div className="section-label spaced">02 <span>DIMENSIONEN</span><span className="unit-tag">METRISCH</span></div>
              {slider('length', 'Länge über alles', 'm')}
              {slider('beam', 'Gesamtbreite', 'm')}
              {slider('draft', 'Tiefgang', 'm')}
              <div className="section-label spaced">03 <span>FORM & FINISH</span></div>
              <label className="field-label" htmlFor="hull-form">Rumpfform</label>
              <div className="select-wrap"><select id="hull-form" value={design.hullShape} onChange={e => change({ ...design, hullShape: e.target.value as Design['hullShape'] })}><option value="round">Rundspant · fließende Linien</option><option value="chine">Knickspant · markante Kanten</option><option value="slender">Schlank · feiner Einlauf</option></select><ChevronDown size={14} /></div>
              <div className="color-row"><span>Rumpffarbe</span><div>{['#42b8ad', '#5ba8d7', '#e2ab62', '#e8ece9', '#43576f'].map(color => <button key={color} title={`Rumpffarbe ${color}`} aria-label={`Rumpffarbe ${color}`} className={design.hullColor === color ? 'active' : ''} style={{ background: color }} onClick={() => change({ ...design, hullColor: color })}>{design.hullColor === color && <Check size={12} />}</button>)}<label className="custom-color" title="Eigene Rumpffarbe"><Plus size={12} /><input aria-label="Eigene Rumpffarbe" type="color" value={design.hullColor} onChange={e => change({ ...design, hullColor: e.target.value })} /></label></div></div>
            </>}
            {tab === 'rig' && <>
              <div className="section-label">01 <span>MAST & POSITION</span></div>
              <div className="rig-illustration"><svg viewBox="0 0 260 125"><path d="M25 94Q120 127 235 90L210 103H50Z" fill="#d0e9e5" stroke="#83b7ad" /><path d="M130 94V15L70 85H130M135 26L196 88H135" fill="#e7efec" stroke="#79a79d" /><path d="M25 113H235" stroke="#bacac4" strokeDasharray="3 4" /><circle cx="130" cy="95" r="4" fill="#299f8e" /></svg><span>Ein Mast. Unendliche Möglichkeiten.</span></div>
              {slider('mastPosition', 'Mastposition ab Bug', '%', 1, '25 % = weiter vorne · 65 % = weiter achtern.')}
              {slider('mastHeight', 'Masthöhe über Deck', 'm')}
              <div className="info-card"><Compass size={18} /><div><strong>Balance beginnt beim Rigg</strong><p>Die Mastposition verschiebt den Segeldruckpunkt. Prüfe die Relation von Rumpf, Kiel und Segelplan im nächsten Konstruktionsschritt.</p></div></div>
              <div className="section-label spaced">02 <span>SEGELDRUCKPUNKT</span></div><div className="metric-inline"><span>Geometrischer Schwerpunkt</span><strong>{format((0.5 - data.center / design.length) * 100)} %<small> ab Bug</small></strong></div><p className="control-caption">Flächengewichtete Näherung der ebenen Segelumrisse, kein aerodynamischer Kraftangriffspunkt.</p>
            </>}
            {tab === 'sails' && <>
              <div className="section-label">01 <span>DEIN SEGELPLAN</span></div>
              <div className="sail-shapes"><button className={design.sailShape === 'classic' ? 'active' : ''} onClick={() => change({ ...design, sailShape: 'classic' })}><svg viewBox="0 0 70 70"><path d="M52 8L16 60H52Z" /></svg><span>Klassisch</span><small>Triangular</small></button><button className={design.sailShape === 'square' ? 'active' : ''} onClick={() => change({ ...design, sailShape: 'square' })}><svg viewBox="0 0 70 70"><path d="M52 8H39L16 60H52Z" /></svg><span>Square Top</span><small>Breiter Segelkopf</small></button></div>
              <div className="section-label spaced">02 <span>FLÄCHE & PROFIL</span></div>
              {slider('mainArea', 'Großsegelfläche', 'm²', 1)}
              {slider('jibArea', 'Vorsegel / Fock', 'm²', 1, '0 m² blendet das Vorsegel aus.')}
              {slider('camber', 'Profiltiefe', '%', 1, 'Visuelle Wölbung relativ zur Unterlieklänge.')}
              <div className="sail-total"><Wind size={21} /><span>Gesamtsegelfläche<strong>{format(data.area, 0)} <small>m²</small></strong></span><ArrowUpRight size={18} /></div>
            </>}
          </div>
          <div className="inspector-note"><Sparkles size={15} /><span>Deine Idee, parametrisch gedacht.<br /><strong>Alles bleibt veränderbar.</strong></span></div>
        </aside>
      </div>

      <section className="metrics-strip" aria-label="Designkennzahlen">
        <div className="metric"><span className="metric-icon"><Anchor size={20} /></span><div><label>LÄNGE / BREITE</label><strong>{format(design.length)} <small>/ {format(design.beam)} m</small></strong><p>Abmessungen über alles</p></div></div>
        <div className="metric"><span className="metric-icon"><Wind size={21} /></span><div><label>SEGELFLÄCHE</label><strong>{format(data.area, 0)} <small>m²</small></strong><p>Großsegel + Vorsegel</p></div></div>
        <div className="metric"><span className="metric-icon"><Waves size={21} /></span><div><label>RUMPFREFERENZ</label><strong>{format(data.hullSpeed)} <small>kn</small><span className="estimate">≈</span></strong><p>Verdrängerformel · nicht Vmax</p></div></div>
        <div className="metric"><span className="metric-icon"><Move3D size={20} /></span><div><label>SCHLANKHEIT</label><strong>{format(data.slenderness)} <small>L / B</small></strong><p>{design.type === 'mono' ? 'Hauptrumpf' : 'Einzel- / Hauptrumpf'}</p></div></div>
      </section>
      <footer className="page-footer"><span className={data.overhang ? 'warning-text' : ''}>{data.overhang ? <HelpCircle size={13} /> : <Check size={13} />}{data.overhang ? 'Segel ragen über den Rumpf: Flächen, Mastposition und Höhe prüfen.' : 'Konzept bereit zum Weiterdenken.'}</span><span>Konzeptvisualisierung · keine Baupläne oder Stabilitätsnachweise <button onClick={() => setModal('help')} aria-label="Hinweise zu Näherungswerten"><HelpCircle size={13} /></button></span></footer>
    </main>

    <input className="sr-only" ref={fileInput} type="file" accept=".json" onChange={async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > 65536) throw new Error('Die Datei ist zu groß (max. 64 KB).');
        load(await file.text());
      } catch (error) { notify(`Öffnen fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`, true); }
      event.target.value = '';
    }} />
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>{toast.error ? <HelpCircle size={18} /> : <Check size={18} />}<span>{toast.message}</span><button aria-label="Meldung schließen" onClick={() => setToast(null)}><X size={16} /></button></div>}
    {modal && <div className="modal-backdrop" onClick={() => setModal(null)}><section ref={modalElement} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button autoFocus className="modal-close icon-button" aria-label="Dialog schließen" onClick={() => setModal(null)}><X size={20} /></button>
      <div className="eyebrow">{modal === 'new' ? 'EIN NEUER HORIZONT' : 'WILLKOMMEN AN BORD'}</div><h2 id="modal-title">{modal === 'new' ? 'Womit beginnt deine Idee?' : 'Dein Studio. Kurz erklärt.'}</h2>
      {modal === 'new' ? <><p>Wähle einen Startpunkt und forme daraus dein eigenes Boot. Der aktuelle Entwurf bleibt über Rückgängig erreichbar; speichere wichtige Varianten als Datei.</p><div className="modal-presets">{presets.map(p => <button key={p.type} onClick={() => usePreset(p)}><HullIcon type={p.type} /><strong>{p.name}</strong><span>{typeNames[p.type]} · {format(p.length)} m</span><ArrowUpRight size={18} /></button>)}</div></> : <><p>Sailor Studio ist dein visuelles Werkzeug für frühe Segelbootkonzepte.</p><div className="help-sections"><div><Move3D /><span><strong>Erkunde dein Boot</strong><p>Linke Maustaste: drehen. Mausrad: zoomen. Rechte Maustaste: verschieben. Die Ansichtstasten zeigen Seite, Deck und Bug.</p></span></div><div><SlidersHorizontal /><span><strong>Forme deine Idee</strong><p>Rumpf: Typ, Maße und Spantform. Rigg: Mastposition und Höhe. Segel: Flächen, Kopf und Wölbung. Die Gesamtbreite schließt alle Rümpfe ein.</p></span></div><div><Save /><span><strong>Behalte deine Entwürfe</strong><p>Der letzte Arbeitsstand wird lokal automatisch gesichert. Über „Entwurf speichern“ legst du unabhängige JSON-Dateien an. „Bildexport“ speichert die 3D-Ansicht als PNG.</p></span></div></div><div className="safety-note"><strong>Konzept, nicht Konstruktion</strong><p>Die Rumpfreferenz verwendet 2,43 × √(0,92 × Länge in m). Sie gilt als grobe Verdränger-Näherung, nicht als Geschwindigkeitsprognose für Mehr­rümpfer. Segelflächen sind ebene Umrissflächen, Profiltiefe ist rein visuell. Auftrieb, Gewicht, Ballast, Stabilität, Lasten und hydrodynamische Kräfte werden nicht berechnet. Vor Bau oder Nutzung ist eine fachliche Auslegung erforderlich.</p></div></>}
      <button className="button primary modal-done" onClick={() => setModal(null)}>Zurück ins Studio <ArrowUpRight size={15} /></button>
    </section></div>}
  </div>;
}
