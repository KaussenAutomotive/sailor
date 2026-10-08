export type FoilType = 'T' | 'L' | 'V';
export type FoilPlanform = 'straight' | 'tapered' | 'elliptic';

export interface FoilDesign {
  enabled: boolean;
  visualize: boolean;
  type: FoilType;
  planform: FoilPlanform;
  span: number;
  chord: number;
  taper: number;
  sweep: number;
  cant: number;
  thickness: number;
  incidence: number;
  immersion: number;
  position: number;
  speed: number;
  mass: number;
}

export const foilDefaults: FoilDesign = {
  enabled: false, visualize: true, type: 'T', planform: 'tapered',
  span: 1.6, chord: 0.38, taper: 55, sweep: 12, cant: 8, thickness: 10,
  incidence: 5, immersion: 1.2, position: 45, speed: 18, mass: 6,
};

export const foilLimits = {
  span: [0.4, 3],
  chord: [0.12, 0.8],
  taper: [25, 100],
  sweep: [0, 35],
  cant: [0, 40],
  thickness: [6, 18],
  incidence: [-2, 10],
  immersion: [0.5, 2.5],
  position: [25, 70],
  speed: [0, 35],
  mass: [0.5, 25],
} as const;
export type FoilNumericKey = keyof typeof foilLimits;

export function parseFoils(value: unknown): FoilDesign {
  // Version-1 files created before the foil feature remain valid.
  if (value === undefined) return { ...foilDefaults };
  if (!value || typeof value !== 'object') throw new Error('Ungültige Hydrofoil-Konfiguration.');
  const f = value as Record<string, unknown>;
  if (typeof f.enabled !== 'boolean' || typeof f.visualize !== 'boolean' ||
      !['T', 'L', 'V'].includes(String(f.type)) ||
      !['straight', 'tapered', 'elliptic'].includes(String(f.planform))) throw new Error('Hydrofoil-Typ oder Flügelform ist ungültig.');
  for (const key of Object.keys(foilLimits) as FoilNumericKey[]) {
    const n = f[key];
    const [min, max] = foilLimits[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`Ungültiger Hydrofoil-Wert für ${key}: erlaubt sind ${min} bis ${max}.`);
  }
  return {
    enabled: f.enabled, visualize: f.visualize, type: f.type as FoilType, planform: f.planform as FoilPlanform,
    span: f.span as number, chord: f.chord as number, taper: f.taper as number, sweep: f.sweep as number,
    cant: f.cant as number, thickness: f.thickness as number, incidence: f.incidence as number,
    immersion: f.immersion as number, position: f.position as number, speed: f.speed as number, mass: f.mass as number,
  };
}

export function foilChordFactor(f: FoilDesign, t: number) {
  const distance = f.type === 'T' ? Math.abs(2 * t - 1) : t;
  if (f.planform === 'elliptic') return Math.sqrt(Math.max(0, 1 - distance ** 2));
  if (f.planform === 'tapered') return 1 - distance * (1 - f.taper / 100);
  return 1;
}

export function foilIndicators(f: FoilDesign) {
  const shapeFactor = f.planform === 'elliptic' ? Math.PI / 4 : f.planform === 'tapered' ? (1 + f.taper / 100) / 2 : 1;
  const area = 2 * f.span * f.chord * shapeFactor;
  const aspectRatio = f.span ** 2 / (area / 2);
  const cl = 2 * Math.PI * (f.incidence * Math.PI / 180) * aspectRatio / (aspectRatio + 2);
  const speedMs = f.speed * 0.514444;
  const dynamicPressure = 0.5 * 1025 * speedMs ** 2;
  const verticalFactor = Math.cos(f.cant * Math.PI / 180);
  const lift = f.enabled ? dynamicPressure * area * cl * verticalFactor : 0;
  const cd = 0.015 + cl ** 2 / (Math.PI * 0.8 * aspectRatio);
  const drag = f.enabled ? dynamicPressure * area * cd : 0;
  const weight = f.mass * 1000 * 9.81;
  const fraction = lift / weight;
  const referenceSpeed = f.enabled && cl > 0 ? Math.sqrt(2 * weight / (1025 * area * cl * verticalFactor)) / 0.514444 : null;
  return { area, aspectRatio, cl, cd, lift, drag, weight, fraction, referenceSpeed };
}

export function foilPreviewHeight(f: FoilDesign) {
  if (!f.enabled || !f.visualize) return 0;
  return Math.min(1, Math.max(0, foilIndicators(f).fraction)) * f.immersion * 0.65;
}
