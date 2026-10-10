import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, Scale } from 'lucide-react';
import { Design } from './design';
import { BalanceStatus, analyzeBalance, balanceCurve } from './flow/balance';

const format = (value: number, digits = 2) => (Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toLocaleString('de-DE', { maximumFractionDigits: digits });
const labels: Record<BalanceStatus, string> = { balanced: 'Bilanz erfüllt (Näherung)', unbalanced: 'Kräfte / Momente offen', unstable: 'Instabile Anfangslage', 'outside-model': 'Außerhalb Modellgrenzen' };

export default function BalancePanel({ design, speed, playing, onSpeedChange, onPlay, onReset }: {
  design: Design; speed: number; playing: boolean; onSpeedChange(speed: number): void; onPlay(): void; onReset(): void;
}) {
  const [result, setResult] = useState<ReturnType<typeof analyzeBalance> | null>(null);
  const [curve, setCurve] = useState<ReturnType<typeof balanceCurve>>([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(true);
  useEffect(() => {
    setPending(true);
    const timer = setTimeout(() => {
      try { setResult(analyzeBalance(design, speed)); setError(''); }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { setPending(false); }
    }, 80);
    return () => clearTimeout(timer);
  }, [design, speed]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try { setCurve(balanceCurve(design)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    }, 180);
    return () => clearTimeout(timer);
  }, [design]);
  const maxForce = Math.max(1, ...curve.map(point => Math.max(point.weight, point.foilLift, point.buoyancy)));
  const minForce = Math.min(0, ...curve.map(point => point.foilLift));
  const forceY = (force: number) => 165 - (force - minForce) / (maxForce - minForce) * 140;
  const forcePoints = (key: 'weight' | 'foilLift' | 'buoyancy') => curve.map(point => `${44 + point.speed / 5 * 452},${forceY(point[key])}`).join(' ');
  const maxMoment = Math.max(0.01, ...curve.map(point => Math.max(Math.abs(point.pitchMoment), Math.abs(point.rollMoment))));
  const momentPoints = (key: 'pitchMoment' | 'rollMoment') => curve.map(point => `${44 + point.speed / 5 * 452},${95 - point[key] / maxMoment * 65}`).join(' ');
  return <section className="analysis-panel balance-panel" aria-label="Physikalische Gleichgewichtsprüfung" aria-busy={pending}>
    <div className="analysis-heading"><h2><Scale size={18} /> Auftrieb & Gleichgewicht</h2>{result && <span className={`balance-status ${pending || error ? '' : result.status}`}>{error ? 'Prüfung fehlgeschlagen' : pending ? 'Bilanz wird aktualisiert' : result.hydro.flying ? 'Foil-Flugbereich: nicht bewertet' : labels[result.status]}</span>}</div>
    <div className="speed-playback">
      <button className="icon-button" title={playing ? 'Geschwindigkeitsverlauf pausieren' : 'Geschwindigkeitsverlauf abspielen'} aria-pressed={playing} onClick={onPlay}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
      <button className="icon-button" title="Zur Entwurfsgeschwindigkeit" onClick={onReset}><RotateCcw size={17} /></button>
      <label htmlFor="balance-speed">Vorschaugeschwindigkeit</label><input id="balance-speed" type="range" min={0.1} max={5} step={0.1} value={speed} onChange={event => onSpeedChange(Number(event.target.value))} /><strong>{format(speed, 1)} m/s</strong>
    </div>
    {error && <p role="alert">Bilanz konnte nicht berechnet werden: {error}</p>}
    {result && <>
      <div className="analysis-stats balance-stats">
        <div><span>Gewichtskraft</span><strong>{format(result.weight)} N</strong></div>
        <div><span>Foil-Auftrieb</span><strong>{format(result.foilLift)} N</strong></div>
        <div><span>Rumpf-Auftrieb</span><strong>{format(result.buoyancy)} N</strong></div>
        <div><span>Vertikale Restkraft</span><strong>{format(result.verticalResidual, 3)} N</strong></div>
        <div><span>Nickmoment um Schwerpunkt</span><strong>{format(result.pitchMoment, 3)} Nm</strong></div>
        <div><span>Rollmoment um Schwerpunkt</span><strong>{format(result.rollMoment, 3)} Nm</strong></div>
        <div><span>Rückstellung Nick / Roll</span><strong>{result.pitchStiffness === null || result.rollStiffness === null ? 'Nicht bewertbar' : `${format(result.pitchStiffness)} / ${format(result.rollStiffness)} Nm/rad`}</strong></div>
        <div><span>Prüftoleranz Kraft / Moment</span><strong>{format(result.forceTolerance, 3)} N / {format(result.momentTolerance, 3)} Nm</strong></div>
      </div>
      <div className="balance-center-line"><span><i className="cg-dot" /> CG: X {format(result.center.x * 1000, 1)} · Y {format(result.center.y * 1000, 1)} · Z {format(result.center.z * 1000, 1)} mm</span><span><i className="cb-dot" /> CB: X {format(result.buoyancyCenter.x * 1000, 1)} · Y {format(result.buoyancyCenter.y * 1000, 1)} · Z {format(result.buoyancyCenter.z * 1000, 1)} mm</span></div>
      <p className="analysis-note">Aufrechte Kraft- und Momentenbilanz. CG = Massenschwerpunkt, CB = verdrängter Volumenschwerpunkt. Rückstellung gilt für kleine Winkel und konstanten vertikalen Foil-Auftrieb, nicht als vollständiger Stabilitätsnachweis.</p>
      {result.warnings.length > 0 && <ul className="analysis-warnings">{result.warnings.map(text => <li className="warn" key={text}>{text}</li>)}</ul>}
    </>}
    <div className="balance-curves">
      <div><h3>Tragkräfte über Geschwindigkeit</h3><svg viewBox="0 0 530 200" role="img" aria-label="Foil-Auftrieb, Rumpf-Auftrieb und Gewichtskraft über Geschwindigkeit">
        <path d="M44 20V165H500" stroke="#a5b2b4" fill="none" />{(['foilLift', 'buoyancy', 'weight'] as const).map((key, index) => <polyline key={key} points={forcePoints(key)} fill="none" stroke={['#238d7f', '#4584b3', '#b45b47'][index]} strokeWidth="2" strokeDasharray={key === 'weight' ? '5 4' : undefined} />)}<path d={`M${44 + speed / 5 * 452} 20V165`} stroke="#b39b42" strokeDasharray="3 3" />
        <text x="2" y="20">{format(maxForce, 0)} N</text><text x="2" y="165">{format(minForce, 0)}</text><text x="44" y="188">0</text><text x="458" y="188">5 m/s</text>
        {curve.map(point => <circle key={point.speed} cx={44 + point.speed / 5 * 452} cy="174" r="2.5" fill={point.status === 'balanced' ? '#238d7f' : point.status === 'unbalanced' ? '#a58224' : '#b45b47'}><title>{format(point.speed)} m/s: {labels[point.status]}</title></circle>)}
      </svg><div className="curve-legend"><span>Foils</span><span>Rumpf</span><span>Gewicht</span></div></div>
      <div><h3>Restmomente über Geschwindigkeit</h3><svg viewBox="0 0 530 200" role="img" aria-label="Nick- und Rollmoment über Geschwindigkeit">
        <path d="M44 20V165H500M44 95H500" stroke="#a5b2b4" fill="none" />{(['pitchMoment', 'rollMoment'] as const).map((key, index) => <polyline key={key} points={momentPoints(key)} fill="none" stroke={['#a58224', '#4584b3'][index]} strokeWidth="2" />)}<path d={`M${44 + speed / 5 * 452} 20V165`} stroke="#b39b42" strokeDasharray="3 3" /><text x="2" y="20">{format(maxMoment)} Nm</text><text x="16" y="98">0</text><text x="44" y="188">0</text><text x="458" y="188">5 m/s</text>
      </svg><div className="balance-moment-legend"><span>Nickmoment</span><span>Rollmoment</span></div></div>
    </div>
    <p className="analysis-note">Kurven bleiben außerhalb des gültigen Bereichs theoretische Referenzen: keine Stall-Polaren, Teilbenetzung, Flugregelung oder gekoppelten Foil-/Rumpfkräfte. Keine automatische Nick-/Rollausrichtung; offene Momente werden angezeigt.</p>
  </section>;
}