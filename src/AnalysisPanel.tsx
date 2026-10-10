import { useEffect, useState } from 'react';
import { Waves } from 'lucide-react';
import { Design } from './design';
import { FlowResult, analyzeFlow, resistanceCurve } from './flow/resistance';
import { nacaSymmetric, solvePanels, streamlines } from './flow/panel';

const format = (value: number, digits = 2) => value.toLocaleString('de-DE', { maximumFractionDigits: digits });
type Analysis = { result: FlowResult; curve: ReturnType<typeof resistanceCurve>; profile: ReturnType<typeof solvePanels>; lines: ReturnType<typeof streamlines> };

export default function AnalysisPanel({ design, selectedFoilId }: { design: Design; selectedFoilId?: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    setPending(true);
    const timer = setTimeout(() => {
      try {
        const foil = design.flow.section === 'foil' && design.foils.enabled && (design.foils.items === undefined || design.foils.items.length > 0);
        const selected = design.foils.items?.find(item => item.id === selectedFoilId) ?? design.foils.items?.[0] ?? design.foils;
        const profile = solvePanels(nacaSymmetric(foil ? selected.thickness / 100 : 0.1, 80), foil ? selected.incidence * Math.cos(('yaw' in selected ? Number(selected.yaw) : 0) * Math.PI / 180) : design.flow.leeway);
        setAnalysis({ result: analyzeFlow(design), curve: resistanceCurve(design, Math.min(5, Math.max(2, design.flow.speed * 1.4)), 14), profile, lines: streamlines(profile, { seeds: 10 }) });
        setError('');
      } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { setPending(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [design, selectedFoilId]);

  if (error) return <section className="analysis-panel" role="alert">Analyse fehlgeschlagen: {error}</section>;
  if (!analysis) return <section className="analysis-panel" role="status">Strömung wird berechnet ...</section>;
  const { result: result, curve, profile, lines } = analysis;
  const maxResistance = Math.max(...curve.map(point => point.total), 0.001);
  const maxSpeed = curve[curve.length - 1].speed;
  const points = (key: 'total' | 'friction' | 'wave' | 'appendage') => curve.map(point => `${36 + point.speed / maxSpeed * 284},${150 - point[key] / maxResistance * 125}`).join(' ');
  const parts = [['Reibung', result.friction], ['Form', result.form], ['Wellen', result.wave], ['Anhänge', result.appendage], ['Induziert', result.induced], ['Foils', result.foil]] as const;
  return <section className="analysis-panel" aria-label="Strömungsanalyse" aria-busy={pending}>
    <div className="analysis-heading"><h2><Waves size={18} /> Strömungsanalyse</h2><span role="status">{pending ? 'Wird aktualisiert ...' : `${format(result.speed)} m/s`}</span></div>
    <div className="analysis-stats">
      <div><span>Gesamtwiderstand</span><strong>{format(result.total)} N</strong></div>
      <div><span>Schleppleistung</span><strong>{format(result.power)} W</strong></div>
      <div><span>Seitenkraft</span><strong>{format(result.sideForce)} N</strong></div>
      <div><span>Tiefgang gesamt</span><strong>{format(result.totalDraft * 1000, 0)} mm</strong></div>
      <div><span>Froude / Reynolds</span><strong>{result.froude === null || result.reynolds === null ? 'Nicht anwendbar' : `${format(result.froude)} / ${result.reynolds.toExponential(2)}`}</strong></div>
      <div><span>Benetzte Fläche</span><strong>{format(result.hydro.hulls.reduce((sum, hull) => sum + hull.wetted, 0), 3)} m²</strong></div>
    </div>
    <div className="analysis-grid">
      <div><h3>Widerstand / Geschwindigkeit</h3><svg viewBox="0 0 350 185" role="img" aria-label="Widerstandskurve in Newton über Geschwindigkeit in Metern pro Sekunde"><path d="M36 20V150H325" fill="none" stroke="#a5b2b4" />{(['total', 'friction', 'wave', 'appendage'] as const).map((key, index) => <polyline key={key} points={points(key)} fill="none" stroke={['#238d7f', '#4584b3', '#b45b47', '#a58224'][index]} strokeWidth={key === 'total' ? 2.5 : 1.5} />)}<text x="3" y="20">{format(maxResistance, 1)} N</text><text x="36" y="173">0</text><text x="278" y="173">{format(maxSpeed)} m/s</text></svg><div className="curve-legend"><span>Gesamt</span><span>Reibung + Form</span><span>Wellen</span><span>Anhänge + Foils</span></div></div>
      <div><h3>Widerstandsanteile</h3><dl className="analysis-parts">{parts.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{format(value, 3)} N</dd></div>)}</dl></div>
      <div><h3>Profilumströmung · CL {format(profile.cl, 3)}</h3><svg viewBox="-1.4 -0.85 3.6 1.7" role="img" aria-label="Berechnete Strömungslinien um den Profilquerschnitt"><g transform="scale(1,-1)">{lines.map((line, index) => <polyline key={index} points={line.map(point => point.join(',')).join(' ')} fill="none" stroke="#4584b3" strokeWidth="0.008" />)}<polygon points={profile.nodes.map(point => point.join(',')).join(' ')} fill="#dbe6e3" stroke="#243638" strokeWidth="0.012" /></g></svg><p className="analysis-note">{design.flow.section === 'foil' && design.foils.items?.length ? `Ausgewählter Foil ${Math.max(0, design.foils.items.findIndex(item => item.id === selectedFoilId)) + 1}. ` : ''}2D-Potentialströmung: keine Viskosität oder Ablösung.</p></div>
    </div>
    <ul className="analysis-warnings">{result.warnings.map(warning => <li key={warning.text} className={warning.level}>{warning.text}</li>)}</ul>
    <p className="analysis-note">ITTC-57 + Formfaktor, Michell-Dünnschiff-Theorie mit Mehrrumpf-Interferenz. Näherung, keine viskose CFD oder Stabilitätsprüfung. Wellenhöhe in 3D ist zur Darstellung überhöht.</p>
  </section>;
}