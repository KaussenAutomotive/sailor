import { Design } from '../design';
import { appendages, lowestPoint } from '../appendages';
import { Equilibrium, equilibrium } from '../hullGeometry';
import { foilIndicators } from '../foils';
import { MichellHull, michellHull, waveResistance } from './michell';
import { gravity, ittc57, plateFriction, sectionDrag, waterProperties } from './water';

export interface FlowWarning { level: 'info' | 'warn'; text: string }

export interface FlowResult {
  speed: number;
  froude: number;
  reynolds: number;
  cf: number;
  formFactor: number;
  friction: number;
  form: number;
  wave: number;
  appendage: number;
  induced: number;
  foil: number;
  total: number;
  sideForce: number;
  power: number;
  appendageReynolds: number;
  hydro: Equilibrium;
  totalDraft: number;
  warnings: FlowWarning[];
}

// Watanabe form factor (as used in ITTC-57 based extrapolation), limited to non-negative values.
export function formFactor(cb: number, length: number, beam: number, draft: number) {
  if (length <= 0 || beam <= 0 || draft <= 0) return 0;
  return Math.max(0, -0.095 + 25.6 * cb / ((length / beam) ** 2 * Math.sqrt(beam / draft)));
}

export function analyzeFlow(d: Design, speed = d.flow.speed): FlowResult {
  const water = waterProperties(d.flow.water);
  const hydro = equilibrium(d, speed);
  const q = 0.5 * water.rho * speed ** 2;
  const main = hydro.main;
  const lwl = Math.max(main.lwl, 1e-3);
  const froude = speed / Math.sqrt(gravity * lwl);
  const reynolds = speed * lwl / water.nu;
  const cf = ittc57(reynolds);
  let friction = 0;
  let form = 0;
  hydro.hulls.forEach(h => {
    if (h.wetted <= 0) return;
    const re = speed * Math.max(h.lwl, 1e-3) / water.nu;
    const f = q * h.wetted * ittc57(re);
    friction += f;
    form += f * formFactor(h.cb, h.lwl, h.bwl, h.draft);
  });
  const michell = hydro.prepared.map(p => michellHull(p, hydro.level)).filter((h): h is MichellHull => h !== null);
  const wave = hydro.flying ? 0 : waveResistance(michell, speed, water.rho);
  const set = appendages(d);
  const leeway = d.flow.leeway * Math.PI / 180;
  let appendage = 0;
  let induced = 0;
  let sideForce = 0;
  let appendageReynolds = Infinity;
  set.foils.forEach(a => {
    const area = a.chord * a.depth;
    const re = speed * a.chord / water.nu;
    appendageReynolds = Math.min(appendageReynolds, re);
    appendage += q * area * sectionDrag(re, a.thickness);
    const ar = 2 * a.depth / a.chord;
    const cl = 2 * Math.PI * leeway * ar / (ar + 2);
    sideForce += q * area * cl;
    induced += q * area * cl ** 2 / (Math.PI * 0.9 * ar);
  });
  if (set.bulb) {
    const b = set.bulb;
    const ratio = b.diameter / b.length;
    const wetted = 0.72 * Math.PI * b.diameter * b.length;
    appendage += q * wetted * plateFriction(speed * b.length / water.nu) * (1 + 1.5 * ratio ** 1.5 + 7 * ratio ** 3);
  }
  const foil = d.foils.enabled ? foilIndicators(d.foils, { speed, mass: d.mass, rho: water.rho, nu: water.nu }).drag : 0;
  const total = friction + form + wave + appendage + induced + foil;
  const lowest = lowestPoint(d);
  const warnings: FlowWarning[] = [];
  if (hydro.overloaded) warnings.push({ level: 'warn', text: 'Überladen: Die Masse ist größer als das Rumpfvolumen bis zum Deck. Masse senken oder Rumpf vergrößern.' });
  if (hydro.flying) warnings.push({ level: 'warn', text: 'Foil-Auftrieb ≥ Gewicht: theoretischer Flugzustand. Rumpfwerte sind dann ohne Bedeutung, keine Höhenregelung modelliert.' });
  if (froude > 0.6) warnings.push({ level: 'warn', text: `Fn ${froude.toFixed(2)}: Gleit-/Halbgleitbereich. Die Verdrängertheorie (Michell) ist hier nur eingeschränkt gültig.` });
  if (reynolds < 5e5) warnings.push({ level: 'info', text: 'Rumpf-Reynoldszahl < 5·10⁵: große laminare Anteile möglich, ITTC-57 kann die Reibung überschätzen.' });
  if (appendageReynolds < 1e5) warnings.push({ level: 'warn', text: 'Anhänge mit Re < 10⁵: laminare Ablöseblasen wahrscheinlich, Profilwiderstand unsicher.' });
  if (main.transomDepth > 0.002 && froude < 0.45) warnings.push({ level: 'info', text: 'Heckspiegel taucht ein: Michell-Rechnung nimmt einen trockenen Spiegel an, bei kleinem Fn eher zu niedrig.' });
  if (main.bwl / lwl > 0.2) warnings.push({ level: 'info', text: 'Breiter Rumpf (B/L > 0,2): Dünnschiff-Theorie wird ungenauer.' });
  return {
    speed, froude, reynolds, cf, formFactor: friction > 0 ? form / friction : 0,
    friction, form, wave, appendage, induced, foil, total, sideForce,
    power: total * speed,
    appendageReynolds: Number.isFinite(appendageReynolds) ? appendageReynolds : 0,
    hydro,
    totalDraft: hydro.level - lowest,
    warnings,
  };
}

export function resistanceCurve(d: Design, maxSpeed: number, samples = 22) {
  return Array.from({ length: samples }, (_, i) => {
    const speed = 0.08 + (maxSpeed - 0.08) * i / (samples - 1);
    const r = analyzeFlow(d, speed);
    return { speed, total: r.total, friction: r.friction + r.form, wave: r.wave, appendage: r.appendage + r.induced + r.foil };
  });
}
