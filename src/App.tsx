import { useEffect, useRef, useState } from 'react';
import {
  Anchor, ArrowDownToLine, ArrowUpRight, Check, ChevronDown, ChevronRight,
  Compass, Copy, Focus, FolderOpen, Grid2X2, HelpCircle, Layers3, Maximize2,
  MousePointer2, Move3D, PanelLeftClose, Plus, RotateCcw, Sailboat,
  Save, SlidersHorizontal, Sparkles, Waves, Wind, X, TrendingUp, Zap, Trash2, MapPin, Play, Pause,
} from 'lucide-react';
import BoatScene, { CameraView, SceneHandle } from './BoatScene';
import { Design, HullType, NumericKey, hullLayout, indicators, limits, massCenterDefaults, massCenterLimits, parseDesign, presets, setHullLength, setHullType } from './design';
import { FoilDesign, FoilInstance, FoilNumericKey, foilDefaults, foilLimits, foilSystemIndicators, maxFoilsPerHull, placementLimits } from './foils';
import { foilPlacementWarnings, individualizeFoils } from './foilGeometry';
import AnalysisPanel from './AnalysisPanel';
import BalancePanel from './BalancePanel';
import { waterProperties } from './flow/water';
import { ShellResolution, designShells, shellResolutions } from './shell';
import { cadTransform, writeStep } from './step';

type Tab = 'hull' | 'rig' | 'sails' | 'foils' | 'flow' | 'cad' | 'balance';
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
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
  return <div className="slider-control">
    <div className="slider-label"><label htmlFor={id}>{label}</label><span>{format(value, decimals)} <small>{unit}</small></span></div>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
      style={{ '--fill': `${(value - min) / (max - min) * 100}%` } as React.CSSProperties} />
    <div className="slider-scale"><span>{format(min, Number.isInteger(min) ? 0 : decimals)} {unit}</span><span>{format(max, Number.isInteger(max) ? 0 : decimals)} {unit}</span></div>
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

function FoilPanel({ foils, onChange, single = false }: { foils: FoilDesign; onChange(next: FoilDesign): void; single?: boolean }) {
  const f = foils;
  const slider = (key: FoilNumericKey, label: string, unit: string, step = 1, caption?: string) =>
    <Slider label={label} value={f[key]} unit={unit} min={foilLimits[key][0]} max={foilLimits[key][1]} step={step}
      onChange={value => onChange({ ...f, [key]: value })} caption={caption} />;
  return <>
    <div className="foil-toggle-card"><span className="foil-toggle-icon"><Zap size={21} /></span><div><strong>{single ? 'Einzel-Foil' : 'Über die Wasserlinie'}</strong><small>{single ? 'Eigene Geometrie & Trimm' : 'Hydrofoils für dein Konzept'}</small></div><button className={`switch ${f.enabled ? 'on' : ''}`} role="switch" aria-checked={f.enabled} aria-label={single ? 'Einzel-Foil aktivieren' : 'Hydrofoils aktivieren'} onClick={() => onChange({ ...f, enabled: !f.enabled })}><span /></button></div>
    {!f.enabled && <p className="foil-disabled-note">Aktiviere die Foils, um Flügelformen zu bearbeiten und ihre idealisierte Wirkung zu vergleichen.</p>}
    <fieldset className="foil-controls" disabled={!f.enabled}>
      <div className="section-label spaced">01 <span>FOIL-ARCHITEKTUR</span></div>
      <div className="foil-types">{(['T', 'L', 'V'] as const).map(type => <button key={type} className={f.type === type ? 'active' : ''} aria-pressed={f.type === type} onClick={() => onChange({ ...f, type })}><svg viewBox="0 0 70 55"><path d={type === 'T' ? 'M35 7V42M12 42H58' : type === 'L' ? 'M48 7V39Q48 43 43 43H15' : 'M12 7L22 32L35 44L48 32L58 7'} /></svg><span>{type}-Foil</span></button>)}</div>
      <label className="field-label foil-form-label" htmlFor="foil-planform">Flügelumriss</label><div className="select-wrap"><select id="foil-planform" value={f.planform} onChange={e => onChange({ ...f, planform: e.target.value as FoilDesign['planform'] })}><option value="straight">Rechteckig · konstante Tiefe</option><option value="tapered">Trapezförmig · verjüngte Spitzen</option><option value="elliptic">Elliptisch · weiche Kontur</option></select><ChevronDown size={14} /></div>
      <div className="section-label spaced">02 <span>FORMGEBUNG</span><span className="unit-tag">PRO FLÜGEL</span></div>
      {slider('span', 'Foil-Spannweite', 'm', 0.01)}
      {slider('chord', 'Flügeltiefe', 'm', 0.01)}
      {f.planform === 'tapered' && slider('taper', 'Spitzentiefe / Wurzeltiefe', '%')}
      {slider('sweep', 'Pfeilung', '°')}
      {slider('cant', 'V-Winkel / Neigung', '°')}
      {slider('thickness', 'Profildicke', '%', 1, 'Symmetrischer NACA-Querschnitt; Dicke beeinflusst den Profilwiderstand, Pfeilung nur die Geometrie.')}
      <div className="section-label spaced">03 <span>POSITION & TRIMM</span></div>
      {!single && slider('position', 'Foilposition ab Bug', '%')}
      {!single && slider('immersion', 'Foil-Eintauchtiefe', 'm', 0.005, 'Tiefe des Flügelansatzes unter der Ruhewasserlinie.')}
      {slider('incidence', 'Foil-Anstellwinkel', '°', 0.5)}
      <div className="section-label spaced">04 <span>WIRKUNGSVERGLEICH</span></div>
      <label className="checkbox-field"><input type="checkbox" checked={f.visualize} onChange={e => onChange({ ...f, visualize: e.target.checked })} /><span>Kraftpfeile & Strömungslinien zeigen</span></label>
      <div className="info-card foil-model-note"><HelpCircle size={16} /><div><strong>Vergleich statt Flugprognose</strong><p>{single ? 'Ein vollständig eingetauchter Flügel.' : 'Zwei vollständig eingetauchte Hauptflügel.'} Ohne Stall, Kavitation, Oberflächenwirkung oder Flugregelung. Kein dynamisches Fluggleichgewicht.</p></div></div>
    </fieldset>
  </>;
}

function PositionField({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange(value: number): void }) {
  const [text, setText] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setText(String(Number(value.toFixed(3)))), [value]);
  return <label className="foil-position-field"><span>{label} <small>{unit}</small></span><input type="number" min={min} max={max} step={step} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} onBlur={() => {
    const next = Number(text);
    if (text.trim() && Number.isFinite(next) && next >= min && next <= max) onChange(next);
    else setText(String(Number(value.toFixed(3))));
  }} /></label>;
}

function FoilConfigurationPanel({ design, selectedId, onSelect, onChange }: { design: Design; selectedId?: string; onSelect(id: string): void; onChange(foils: FoilDesign): void }) {
  const [addHull, setAddHull] = useState(0);
  const foils = design.foils;
  const hulls = hullLayout(design);
  const targetHull = addHull < hulls.length ? addHull : 0;
  const items = foils.items;
  if (items === undefined) return <>
    <button className="button subtle foil-customize" onClick={() => {
      const converted = individualizeFoils(design);
      onChange({ ...foils, items: converted });
      onSelect(converted[0].id);
    }}><Move3D size={16} /> Einzelfoils konfigurieren</button>
    <FoilPanel foils={foils} onChange={onChange} />
  </>;
  const selected = items.find(item => item.id === selectedId) ?? items[0];
  const update = (patch: Partial<FoilInstance>) => {
    if (selected) onChange({ ...foils, items: items.map(item => item.id === selected.id ? { ...item, ...patch } : item) });
  };
  const add = (copy = false) => {
    const hull = copy && selected ? selected.hull : targetHull;
    const count = items.filter(item => item.hull === hull).length;
    if (count >= maxFoilsPerHull) return;
    const item: FoilInstance = { ...(copy && selected ? selected : foilDefaults), enabled: true, id: crypto.randomUUID(), hull,
      position: copy && selected ? selected.position : [15, 85, 35, 65, 25, 75][count],
      lateral: copy && selected ? selected.lateral : hulls[hull].width / 2 * (count % 2 ? -1 : 1),
      yaw: copy && selected ? selected.yaw : 0, mirrored: copy && selected ? selected.mirrored : count % 2 === 0 };
    onChange({ ...foils, items: [...items, item] });
    onSelect(item.id);
  };
  return <>
    <label className="checkbox-field"><input type="checkbox" aria-label="Hydrofoils aktivieren" checked={foils.enabled} onChange={event => onChange({ ...foils, enabled: event.target.checked })} /><span>Hydrofoils aktiv</span></label>
    <label className="field-label" htmlFor="new-foil-hull">Rumpf für neuen Foil</label><div className="select-wrap"><select id="new-foil-hull" value={targetHull} onChange={event => setAddHull(Number(event.target.value))}>{hulls.map((_, index) => <option key={index} value={index}>Rumpf {index + 1} · {items.filter(item => item.hull === index).length} / 6</option>)}</select></div>
    <div className="foil-list-tools">
      <button className="button subtle" title="Foil hinzufügen" disabled={items.filter(item => item.hull === targetHull).length >= maxFoilsPerHull} onClick={() => add()}><Plus size={16} /> Foil hinzufügen</button>
      <button className="icon-button" title="Foil duplizieren" disabled={!selected || items.filter(item => item.hull === selected.hull).length >= maxFoilsPerHull} onClick={() => add(true)}><Copy size={16} /></button>
      <button className="icon-button" title="Foil entfernen" disabled={!selected} onClick={() => { const remaining = items.filter(item => item.id !== selected.id); onChange({ ...foils, items: remaining }); if (remaining[0]) onSelect(remaining[0].id); }}><Trash2 size={16} /></button>
    </div>
    <label className="field-label" htmlFor="selected-foil">Foil auswählen</label><div className="select-wrap"><select id="selected-foil" value={selected?.id ?? ''} disabled={!items.length} onChange={event => onSelect(event.target.value)}>{!items.length && <option value="">Keine Foils</option>}{items.map((item, index) => <option key={item.id} value={item.id}>Foil {index + 1} · Rumpf {item.hull + 1}{item.enabled ? '' : ' · aus'}</option>)}</select></div>
    {selected && <div key={selected.id} className="foil-instance-editor">
      <label className="field-label" htmlFor="foil-hull">Rumpfzuordnung</label><div className="select-wrap"><select id="foil-hull" value={selected.hull} onChange={event => update({ hull: Number(event.target.value) })}>{hulls.map((_, index) => <option key={index} value={index}>Rumpf {index + 1}</option>)}</select></div>
      <div className="foil-position-grid">
        <PositionField label="Längsposition ab Bug" unit="mm" value={hulls[selected.hull].length * selected.position * 10} min={0} max={hulls[selected.hull].length * 1000} onChange={value => update({ position: value / (hulls[selected.hull].length * 10) })} />
        <PositionField label="Querposition zur Rumpfmitte" unit="mm" value={selected.lateral * 1000} min={placementLimits.lateral[0] * 1000} max={placementLimits.lateral[1] * 1000} onChange={value => update({ lateral: value / 1000 })} />
        <PositionField label="Eintauchtiefe" unit="mm" value={selected.immersion * 1000} min={foilLimits.immersion[0] * 1000} max={foilLimits.immersion[1] * 1000} onChange={value => update({ immersion: value / 1000 })} />
        <PositionField label="Drehwinkel" unit="°" value={selected.yaw} min={placementLimits.yaw[0]} max={placementLimits.yaw[1]} onChange={value => update({ yaw: value })} />
      </div>
      <label className="checkbox-field"><input type="checkbox" checked={selected.mirrored} onChange={event => update({ mirrored: event.target.checked })} /><span>Flügel spiegeln</span></label>
      <FoilPanel single foils={selected} onChange={next => update(next)} />
    </div>}
  </>;
}

function FoilEffects({ design }: { design: Design }) {
  const f = design.foils;
  const conditions = { speed: design.flow.speed, mass: design.mass, ...waterProperties(design.flow.water) };
  const info = foilSystemIndicators(f, conditions);
  const peak = foilSystemIndicators(f, { ...conditions, speed: 5 });
  const max = Math.max(info.weight * 1.4, Math.abs(peak.lift) * 1.12);
  const points = Array.from({ length: 36 }, (_, index) => `${12 + index / 35 * 226},${78 - Math.abs(foilSystemIndicators(f, { ...conditions, speed: index / 35 * 5 }).lift) / max * 62}`).join(' ');
  const weightY = 78 - info.weight / max * 62;
  const x = 12 + design.flow.speed / 5 * 226;
  const y = 78 - Math.abs(info.lift) / max * 62;
  const tipReach = f.span * (f.type === 'T' ? 0.5 : 1) * Math.cos(f.cant * Math.PI / 180);
  const attachment = design.beam * (design.type === 'mono' ? 0.36 : 0.42);
  const bottomAttachment = attachment - (f.type === 'V' ? Math.min(attachment * 0.6, f.immersion * Math.tan(f.cant * Math.PI / 180)) : 0);
  const active = f.items?.filter(item => item.enabled);
  const surfaceRisk = active ? active.some(item => item.span * (item.type === 'T' ? 0.5 : 1) * Math.sin(item.cant * Math.PI / 180) + item.chord * 0.15 > item.immersion) : f.span * (f.type === 'T' ? 0.5 : 1) * Math.sin(f.cant * Math.PI / 180) + f.chord * 0.15 > f.immersion;
  const overlap = f.items === undefined && tipReach > bottomAttachment;
  const placementWarnings = foilPlacementWarnings(design);
  return <section className="foil-effects" aria-label="Hydrofoil-Wirkung">
    <div className="foil-effect-heading"><span className="foil-effect-logo"><Zap size={18} /></span><div><strong>Foil Lab<span>EXPERIMENTELL</span></strong><p>{active ? `${active.length} aktive Einzelfoils` : `${f.type}-Foil-Paar`} · {format(info.area, 3)} m² Fläche · {format(design.flow.speed)} m/s · {format(design.mass)} kg</p></div><span className="foil-assumption">IDEALISIERT · VOLL EINGETAUCHT</span></div>
    <div className="foil-effect-grid">
      <div className={`foil-stat ${info.lift < 0 ? 'negative' : ''}`}><label>VERTIKALER AUFTRIEB</label><strong>{format(info.lift, 2)} <small>N</small></strong><p>{format(info.fraction * 100, 0)} % der Gewichtskraft</p><div className="lift-meter"><span style={{ width: `${Math.min(100, Math.abs(info.fraction) * 100)}%` }} /></div></div>
      <div className="foil-stat"><label>FLÜGELWIDERSTAND</label><strong>{format(info.drag, 2)} <small>N</small></strong><p>Profil + induzierter Anteil<br />Ohne Rumpf- / Strebenwiderstand</p></div>
      <div className="foil-stat"><label>AUFTRIEB = GEWICHT</label><strong>{info.referenceSpeed === null ? '—' : format(info.referenceSpeed)} <small>{info.referenceSpeed === null ? '' : 'm/s'}</small></strong><p>{info.referenceSpeed === null ? 'Kein positiver Auftrieb bei diesem Winkel' : 'Theoretische Referenz, keine Abhebegeschwindigkeit'}</p></div>
      <div className="foil-curve"><div><TrendingUp size={12} /><span>AUFTRIEBSBETRAG / TEMPO</span></div><svg viewBox="0 0 250 100" role="img" aria-label="Idealisierter Auftriebsbetrag steigt quadratisch mit der Geschwindigkeit"><path d="M12 78H238" stroke="#dce9e3" /><path d={`M12 ${weightY}H238`} stroke="#b7c8ad" strokeDasharray="3 4" /><polyline points={points} fill="none" stroke={info.lift < 0 ? '#c18462' : '#4fae92'} strokeWidth="2" /><path d={`M${x} 78V${y}`} stroke="#9dc7b6" strokeDasharray="2 3" /><circle cx={x} cy={y} r="3.5" fill={info.lift < 0 ? '#c18462' : '#4fae92'} /><text x="12" y="96">0 m/s</text><text x="205" y="96">5 m/s</text><text x="16" y={Math.max(10, weightY - 4)}>Gewicht</text></svg></div>
    </div>
    {f.items !== undefined && <div className="foil-analysis-detail">
      <div className="foil-table-scroll"><table className="foil-analysis-table"><caption>Einzelfoil-Analyse</caption><thead><tr><th>Foil</th><th>Rumpf</th><th>Fläche</th><th>Auftrieb</th><th>Widerstand</th><th>CL</th><th>Re</th></tr></thead><tbody>{info.foils.map((foil, index) => <tr key={foil.item.id}><th>Foil {index + 1}{foil.item.enabled ? '' : ' (aus)'}</th><td>{foil.item.hull + 1}</td><td>{format(foil.area, 4)} m²</td><td>{format(foil.lift, 3)} N</td><td>{format(foil.drag, 3)} N</td><td>{format(foil.cl, 3)}</td><td>{foil.re.toExponential(2)}</td></tr>)}</tbody></table></div>
      <p className="analysis-note">Einzelkräfte ohne Foil-Wechselwirkungen. Drehwinkel projiziert den Anstellwinkel; große Drehwinkel sind nicht hydrodynamisch aufgelöst.</p>
      {placementWarnings.length > 0 && <ul className="analysis-warnings">{placementWarnings.map(text => <li className="warn" key={text}>{text}</li>)}</ul>}
    </div>}
    <div className={`foil-effect-footnote ${surfaceRisk || overlap ? 'foil-warning' : ''}`}><HelpCircle size={12} /><span>{overlap ? 'Foil-Flügel können sich überschneiden. Spannweite, Neigung oder Bootbreite prüfen; Flächenbilanz ist dann nicht gültig.' : surfaceRisk ? 'Oberflächenberührung möglich: Neigung und Eintauchtiefe prüfen. Das Modell berechnet keine teilgetauchten Foils.' : 'Unabhängige Kräfte ohne Foil-Wechselwirkungen, Strebenwiderstand oder Stabilitätsnachweis.'}</span></div>
  </section>;
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
  const [resolution, setResolution] = useState<ShellResolution>('standard');
  const [scope, setScope] = useState<'all' | 'main'>('all');
  const [exporting, setExporting] = useState(false);
  const [selectedFoilId, setSelectedFoilId] = useState<string>();
  const [showCenters, setShowCenters] = useState(true);
  const [previewSpeed, setPreviewSpeed] = useState<number | null>(null);
  const [playingSpeed, setPlayingSpeed] = useState(false);
  const previewDesign = previewSpeed === null ? design : { ...design, flow: { ...design.flow, speed: previewSpeed } };
  const massCenter = design.massCenter ?? massCenterDefaults;
  const selectedFoil = design.foils.items?.find(item => item.id === selectedFoilId) ?? design.foils.items?.[0];
  const scene = useRef<SceneHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const modalElement = useRef<HTMLElement>(null);
  const gesture = useRef<Design | null>(null);
  const data = indicators(design);
  const notify = (message: string, error = false) => setToast({ message, error });

  useEffect(() => {
    if (!playingSpeed) return;
    let speed = previewSpeed === null || previewSpeed >= 5 ? 0.1 : previewSpeed;
    setPreviewSpeed(speed);
    const timer = window.setInterval(() => {
      speed = Math.min(5, Number((speed + 0.1).toFixed(1)));
      setPreviewSpeed(speed);
      if (speed >= 5) setPlayingSpeed(false);
    }, 400);
    return () => window.clearInterval(timer);
  }, [playingSpeed]);

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
    if (!design.foils.enabled && view === 'foils') setView('perspective');
  }, [design.foils.enabled, view]);
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
    if (next.foils.items) {
      const hullCount = hullLayout(next).length;
      if (next.foils.items.some(item => item.hull >= hullCount) || Array.from({ length: hullCount }, (_, hull) => next.foils.items!.filter(item => item.hull === hull).length).some(count => count > maxFoilsPerHull)) {
        notify('Foil-Zuordnung ungültig: maximal 6 Foils pro vorhandenem Rumpf. Bitte zuerst Foils umordnen oder entfernen.', true);
        return;
      }
    }
    if (JSON.stringify(next) === JSON.stringify(design)) return;
    if (!gesture.current) setUndo(previous => [...previous.slice(-49), design]);
    setRedo([]);
    setDesign(next);
    setSaved(false);
  }
  function numeric(key: NumericKey, value: number) {
    change(key === 'length' ? setHullLength(design, 0, value) : { ...design, [key]: value });
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
  async function exportStep() {
    setExporting(true);
    try {
      const validated = parseDesign(JSON.stringify(design));
      const shells = designShells(validated, validated.wallThickness, resolution, scope);
      const text = writeStep(shells.solids, { name: validated.name, transform: cadTransform(shells.xStern) });
      if (window.sailor) {
        if (!await window.sailor.saveStep(text)) return;
      } else download(text, `${validated.name}.step`, 'application/step');
      notify(`STEP exportiert: ${shells.solids.length} Rumpfkörper, ${format(shells.volume * 1e6, 1)} cm³ Material.`);
    } catch (error) { notify(`STEP-Export fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`, true); }
    finally { setExporting(false); }
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
      <div className="page-heading"><div><div className="eyebrow">SAILOR STUDIO</div><h1>Modellsegler<span>.</span></h1><p>0,3–2,0 m · Entwurf, Strömung und Rumpf-CAD</p></div><div className="studio-tag"><span /><span>MODELLDESIGN<small>SI-Einheiten · maximal 2 m</small></span></div></div>
      <div className="designer-layout">
        <section className="canvas-panel">
          <div className="canvas-header"><div className="design-title"><span className="design-symbol"><Sailboat size={19} /></span><div><input aria-label="Entwurfsname" maxLength={60} value={design.name} onChange={e => change({ ...design, name: e.target.value })} /><small>{typeNames[design.type]} <span> / </span> Konzeptentwurf</small></div><span className="revision">V1</span></div><div className="history-actions"><button className="icon-button" title="Rückgängig" disabled={!undo.length} onClick={undoChange}><RotateCcw size={17} /></button><button className="icon-button redo" title="Wiederholen" disabled={!redo.length} onClick={redoChange}><RotateCcw size={17} /></button><span /><button className="icon-button" title="Entwurf duplizieren" onClick={() => { change({ ...design, name: `${design.name.slice(0, 52)} Kopie` }); notify('Arbeitskopie erstellt. Zum Behalten als Datei speichern.'); }}><Copy size={16} /></button></div></div>
          <div className="viewport" ref={viewport}>
            <BoatScene ref={scene} design={previewDesign} view={view} wireframe={wireframe} water={water} selectedFoilId={selectedFoil?.id} showCenters={showCenters} />
            <div className="viewport-top"><span className="live-badge"><span /> LIVE PREVIEW</span><span className="viewport-caption">{view === 'foils' ? 'FOIL DETAIL / WASSER AUSGEBLENDET' : 'PARAMETRIC DESIGN / 01'}</span></div>
            <div className="view-selector">{([['perspective', '3D'], ['side', 'Seite'], ['top', 'Deck'], ['front', 'Bug']] as const).map(([key, label]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{key === 'perspective' && <Move3D size={13} />}{label}</button>)}{design.foils.enabled && <button className={view === 'foils' ? 'active' : ''} onClick={() => setView('foils')}><Zap size={12} /> Foil-Detail</button>}</div>
            <div className="viewport-tools">
              <button title="Ansicht zentrieren" onClick={() => scene.current?.reset()}><Focus size={18} /></button>
              <button title={view === 'foils' ? 'Wasser ist in der Foil-Detailansicht ausgeblendet' : 'Wasserfläche umschalten'} disabled={view === 'foils'} className={water && view !== 'foils' ? 'active' : ''} onClick={() => setWater(!water)}><Waves size={18} /></button>
              <button title="Maße einblenden" className={dimensions ? 'active' : ''} onClick={() => setDimensions(!dimensions)}><SlidersHorizontal size={18} /></button>
              <button title="Schwerpunktmarker umschalten" className={showCenters ? 'active' : ''} onClick={() => setShowCenters(!showCenters)}><MapPin size={18} /></button>
              <span /><button title="Vollbild" onClick={fullscreen}><Maximize2 size={17} /></button>
            </div>
            {dimensions && <div className="dimension-readout"><span>LÄNGE ÜBER ALLES</span><div><i /><strong>{format(design.length, 2)} m</strong><i /></div><small>B {format(design.beam, 2)} m <span>·</span> Schwert {format(design.finDepth, 2)} m</small></div>}
            <div className="axis-widget"><span className="axis-y">Y</span><span className="axis-z">Z</span><span className="axis-x">X</span><svg width="60" height="55"><path d="M28 32V7M28 32L51 43M28 32L6 43" stroke="#839bad" /><circle cx="28" cy="32" r="3" fill="#f4f9fa" /></svg></div>
            <div className="viewport-bottom"><span><MousePointer2 size={13} /> Ziehen zum Drehen <span>·</span> Scrollen zum Zoomen <span>·</span> Rechtsziehen zum Verschieben</span><span className="render-status"><span /> ECHTZEIT 3D</span></div>
          </div>
          <div className="canvas-footer"><div className="render-modes"><button className={!wireframe ? 'active' : ''} onClick={() => setWireframe(false)}><Layers3 size={14} /> Studio</button><button className={wireframe ? 'active' : ''} onClick={() => setWireframe(true)}><Grid2X2 size={14} /> Drahtmodell</button></div><span><span className="small-dot" /> Änderungen direkt sichtbar</span></div>
          <div className="scene-speed-bar">
            <button className="icon-button" title={playingSpeed ? '3D-Geschwindigkeitsvorschau pausieren' : '3D-Geschwindigkeitsvorschau abspielen'} aria-pressed={playingSpeed} onClick={() => setPlayingSpeed(previous => !previous)}>{playingSpeed ? <Pause size={16} /> : <Play size={16} />}</button>
            <label htmlFor="scene-speed">Tempo</label><input id="scene-speed" aria-label="3D-Vorschaugeschwindigkeit" type="range" min={0.1} max={5} step={0.1} value={previewDesign.flow.speed} onChange={event => { setPlayingSpeed(false); setPreviewSpeed(Number(event.target.value)); }} /><strong>{format(previewDesign.flow.speed)} m/s</strong>
            <button className="icon-button" title="3D-Tempo zurücksetzen" onClick={() => { setPlayingSpeed(false); setPreviewSpeed(null); }}><RotateCcw size={15} /></button>
          </div>
        </section>

        <aside className="inspector">
          <div className="inspector-heading"><div><SlidersHorizontal size={17} /><strong>Designparameter</strong></div><button className="icon-button" title="Aktuelle Vorlage zurücksetzen" onClick={() => usePreset(presets.find(p => p.type === design.type)!)}><RotateCcw size={15} /></button></div>
          <div className="inspector-tabs">{([['hull', 'Rumpf'], ['rig', 'Rigg'], ['sails', 'Segel'], ['foils', 'Foils'], ['flow', 'Strömung'], ['cad', 'CAD'], ['balance', 'Balance']] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={tab === key ? 'active' : ''}>{label}</button>)}</div>
          <div className="inspector-content" onPointerDown={event => { if (event.target instanceof HTMLInputElement && event.target.type === 'range') startGesture(); }} onPointerUp={endGesture} onPointerCancel={endGesture} onBlur={endGesture}>
            {tab === 'hull' && <>
              <div className="section-label">01 <span>RUMPFKONZEPT</span></div>
              <div className="hull-options">{(['mono', 'cat', 'tri'] as const).map(type => <button key={type} aria-pressed={design.type === type} className={design.type === type ? 'active' : ''} onClick={() => change(setHullType(design, type))}><HullIcon type={type} /><span>{type === 'mono' ? 'Mono' : type === 'cat' ? 'Katamaran' : 'Trimaran'}</span>{design.type === type && <span className="option-check"><Check size={10} /></span>}</button>)}</div>
              <div className="section-label spaced">02 <span>DIMENSIONEN</span><span className="unit-tag">METRISCH</span></div>
              {design.type === 'mono' ? slider('length', 'Länge über alles', 'm', 0.01) : <>
                {hullLayout(design).map((hull, index) => <Slider key={index} label={design.type === 'cat' ? index === 0 ? 'Länge Backbordrumpf' : 'Länge Steuerbordrumpf' : index === 0 ? 'Länge Hauptrumpf' : index === 1 ? 'Länge Ausleger Backbord' : 'Länge Ausleger Steuerbord'} value={hull.length} unit="m" min={limits.length[0]} max={limits.length[1]} step={0.01} onChange={value => change(setHullLength(design, index, value))} />)}
                <div className="metric-inline"><span>Länge über alles</span><strong>{format(design.length, 2)} m</strong></div>
              </>}
              {slider('beam', 'Gesamtbreite', 'm', 0.01)}
              {slider('hullDepth', 'Rumpftiefe', 'm', 0.005)}
              {slider('finDepth', 'Schwerttiefe', 'm', 0.005)}
              {slider('mass', 'Gesamtmasse', 'kg', 0.1)}
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
              <div className="section-label spaced">02 <span>SEGELDRUCKPUNKT</span></div><div className="metric-inline"><span>Geometrischer Schwerpunkt</span><strong>{format((0.5 - data.center / hullLayout(design).find(hull => hull.main)!.length) * 100)} %<small> ab Bug des Hauptrumpfs</small></strong></div><p className="control-caption">Flächengewichtete Näherung der ebenen Segelumrisse, kein aerodynamischer Kraftangriffspunkt.</p>
            </>}
            {tab === 'sails' && <>
              <div className="section-label">01 <span>DEIN SEGELPLAN</span></div>
              <div className="sail-shapes"><button className={design.sailShape === 'classic' ? 'active' : ''} onClick={() => change({ ...design, sailShape: 'classic' })}><svg viewBox="0 0 70 70"><path d="M52 8L16 60H52Z" /></svg><span>Klassisch</span><small>Triangular</small></button><button className={design.sailShape === 'square' ? 'active' : ''} onClick={() => change({ ...design, sailShape: 'square' })}><svg viewBox="0 0 70 70"><path d="M52 8H39L16 60H52Z" /></svg><span>Square Top</span><small>Breiter Segelkopf</small></button></div>
              <div className="section-label spaced">02 <span>FLÄCHE & PROFIL</span></div>
              {slider('mainArea', 'Großsegelfläche', 'm²', 0.01)}
              {slider('jibArea', 'Vorsegel / Fock', 'm²', 0.01)}
              {slider('camber', 'Profiltiefe', '%', 1, 'Visuelle Wölbung relativ zur Unterlieklänge.')}
              <div className="sail-total"><Wind size={21} /><span>Gesamtsegelfläche<strong>{format(data.area, 2)} <small>m²</small></strong></span><ArrowUpRight size={18} /></div>
            </>}
            {tab === 'foils' && <FoilConfigurationPanel design={design} selectedId={selectedFoil?.id} onSelect={setSelectedFoilId} onChange={foils => change({ ...design, foils })} />}
            {tab === 'flow' && <>
              <Slider label="Geschwindigkeit" value={design.flow.speed} unit="m/s" min={0.1} max={5} step={0.1} onChange={speed => change({ ...design, flow: { ...design.flow, speed } })} />
              <Slider label="Abdrift" value={design.flow.leeway} unit="°" min={0} max={10} step={0.5} onChange={leeway => change({ ...design, flow: { ...design.flow, leeway } })} />
              <label className="field-label" htmlFor="flow-water">Wasser</label><div className="select-wrap"><select id="flow-water" value={design.flow.water} onChange={event => change({ ...design, flow: { ...design.flow, water: event.target.value as Design['flow']['water'] } })}><option value="fresh">Süßwasser · 20 °C</option><option value="salt">Salzwasser · 20 °C</option></select></div>
              <label className="checkbox-field"><input type="checkbox" checked={design.flow.waves} onChange={event => change({ ...design, flow: { ...design.flow, waves: event.target.checked } })} /><span>Kelvin-Wellenbild</span></label>
              <label className="field-label" htmlFor="flow-section">Profilanalyse</label><div className="select-wrap"><select id="flow-section" value={design.flow.section} onChange={event => change({ ...design, flow: { ...design.flow, section: event.target.value as Design['flow']['section'] } })}><option value="keel">Kiel / Schwert</option><option value="foil" disabled={!design.foils.enabled}>Hydrofoil</option></select></div>
            </>}
            {tab === 'cad' && <>
              <Slider label="Wandstärke" value={design.wallThickness * 1000} unit="mm" min={limits.wallThickness[0] * 1000} max={limits.wallThickness[1] * 1000} step={0.1} onChange={value => numeric('wallThickness', value / 1000)} />
              <label className="field-label" htmlFor="cad-resolution">Auflösung</label><div className="select-wrap"><select id="cad-resolution" value={resolution} onChange={event => setResolution(event.target.value as ShellResolution)}>{Object.entries(shellResolutions).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></div>
              <label className="field-label" htmlFor="cad-scope">Rumpfauswahl</label><div className="select-wrap"><select id="cad-scope" value={scope} onChange={event => setScope(event.target.value as 'all' | 'main')}><option value="all">Alle Rümpfe</option><option value="main">Haupt- / Einzelrumpf</option></select></div>
              <button className="button primary" disabled={exporting} onClick={exportStep}><ArrowDownToLine size={16} />{exporting ? 'Export läuft' : 'STEP exportieren'}</button>
              <p className="control-caption">AP214 · Millimeter · facettierte Rumpfschale mit offenem Deck. Ohne Rigg, Kiel, Foils und Verbindungen. Lokale Wandstärke an Bug und Kanten ist angenähert; vor Fertigung im CAD prüfen.</p>
            </>}
            {tab === 'balance' && <>
              <div className="section-label">01 <span>MASSENSCHWERPUNKT</span></div>
              {slider('mass', 'Gesamtmasse', 'kg', 0.1)}
              <div className="mass-center-fields">{([['x', 'Schwerpunkt längs (X)'], ['y', 'Schwerpunkt Höhe (Y)'], ['z', 'Schwerpunkt quer (Z)']] as const).map(([axis, label]) => <PositionField key={axis} label={label} unit="mm" value={massCenter[axis] * 1000} min={massCenterLimits[axis][0] * 1000} max={massCenterLimits[axis][1] * 1000} onChange={value => change({ ...design, massCenter: { ...massCenter, [axis]: value / 1000 } })} />)}</div>
              <p className="control-caption">Bootsrahmen: X positiv zum Bug, Z positiv nach Steuerbord, Y positiv nach oben. X/Z = 0 liegt in der Bootsmitte; Y = 0 ist die feste Geometrienullhöhe, nicht die Wasserlinie.</p>
              <button className="button subtle" onClick={() => change({ ...design, massCenter: { ...massCenterDefaults } })}><RotateCcw size={15} /> Schwerpunkt zurücksetzen</button>
              <p className="control-caption">Rot: Schwerpunkt und Gewichtskraft. Blau: Volumenschwerpunkt und Rumpfauftrieb. Pfeillängen zeigen relative Kräfte. Voreinstellung ist eine Annahme, keine Massenberechnung.</p>
            </>}
          </div>
          <div className="inspector-note"><Sparkles size={15} /><span>Deine Idee, parametrisch gedacht.<br /><strong>Alles bleibt veränderbar.</strong></span></div>
        </aside>
      </div>

      <section className="metrics-strip" aria-label="Designkennzahlen">
        <div className="metric"><span className="metric-icon"><Anchor size={20} /></span><div><label>LÄNGE / BREITE</label><strong>{format(design.length)} <small>/ {format(design.beam)} m</small></strong><p>Abmessungen über alles</p></div></div>
        <div className="metric"><span className="metric-icon"><Wind size={21} /></span><div><label>SEGELFLÄCHE</label><strong>{format(data.area, 2)} <small>m²</small></strong><p>Großsegel + Vorsegel</p></div></div>
        <div className="metric"><span className="metric-icon"><Waves size={21} /></span><div><label>GESCHWINDIGKEIT</label><strong>{format(previewDesign.flow.speed)} <small>m/s</small></strong><p>Analyse-Betriebspunkt</p></div></div>
        <div className="metric"><span className="metric-icon"><Move3D size={20} /></span><div><label>SCHLANKHEIT</label><strong>{format(data.slenderness)} <small>L / B</small></strong><p>{design.type === 'mono' ? 'Hauptrumpf' : 'Einzel- / Hauptrumpf'}</p></div></div>
      </section>
      <BalancePanel design={design} speed={previewDesign.flow.speed} playing={playingSpeed} onSpeedChange={speed => { setPlayingSpeed(false); setPreviewSpeed(speed); }} onPlay={() => setPlayingSpeed(previous => !previous)} onReset={() => { setPlayingSpeed(false); setPreviewSpeed(null); }} />
      {design.foils.enabled && <FoilEffects design={previewDesign} />}
      <AnalysisPanel design={previewDesign} selectedFoilId={selectedFoil?.id} />
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
      {modal === 'new' ? <><p>Wähle einen Startpunkt. Der aktuelle Entwurf bleibt über Rückgängig erreichbar.</p><div className="modal-presets">{presets.map(p => <button key={p.type} onClick={() => usePreset(p)}><HullIcon type={p.type} /><strong>{p.name}</strong><span>{typeNames[p.type]} · {format(p.length)} m</span><ArrowUpRight size={18} /></button>)}</div></> : <><p>Modellsegler von 0,3 bis 2 m Rumpflänge. Längen in m, Wandstärken in mm, Masse in kg, Tempo in m/s und Kräfte in N.</p><div className="help-sections"><div><Waves /><span><strong>Strömungsmodell</strong><p>Aufrechte Hydrostatik, ITTC-57-Reibung, Formfaktor und Michell-Wellenwiderstand mit Mehrrumpf-Interferenz. Profilumströmung durch ein 2D-Panelverfahren. Keine viskose CFD, Ablösung, Gleitfahrt oder dynamische Stabilität.</p></span></div><div><Zap /><span><strong>Foil-Näherung</strong><p>Zwei vollständig eingetauchte Flügel, Auftrieb nach endlicher Flügeltheorie. Profilwiderstand abhängig von Reynolds-Zahl und Profildicke. Dichte und Viskosität folgen der Wasserwahl. Keine Flugregelung, Kavitation oder Oberflächenwirkung. 3D-Strömungslinien an Foils sind symbolisch.</p></span></div><div><ArrowDownToLine /><span><strong>CAD-Export</strong><p>AP214-STEP in Millimetern: offene Rumpfschalen als geschlossene Materialkörper, mit 0,4 bis 5 mm Wandstärke. Facettierte Flächen; ohne Rigg und Anhänge. Der Normalenversatz an Kanten und Bug ist angenähert.</p></span></div><div><Save /><span><strong>Entwurfsdateien</strong><p>Version 2 speichert Wandstärke und Strömungseinstellungen. Version-1-Großboote werden beim Laden auf 1 m skaliert.</p></span></div></div><div className="safety-note"><strong>Kein Fertigungs- oder Stabilitätsnachweis</strong><p>Masse ist eine Annahme. Wandabstände, Material, Verbindungen und Stabilität vor einem Bau fachlich prüfen. Schleppleistung ist keine Geschwindigkeitsprognose.</p></div></>}
      <button className="button primary modal-done" onClick={() => setModal(null)}>Zurück ins Studio <ArrowUpRight size={15} /></button>
    </section></div>}
  </div>;
}
