import { gravity, sectionDrag } from './flow/water';

export type FoilType = 'T' | 'L' | 'V';
export type FoilPlanform = 'straight' | 'tapered' | 'elliptic';

// Lengths in metres (model scale). Span is measured per wing.
export interface FoilParameters {
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
  speed?: number;
  mass?: number;
}

export interface FoilInstance extends FoilParameters {
  id: string;
  hull: number;
  lateral: number;
  yaw: number;
  mirrored: boolean;
}

export interface FoilDesign extends FoilParameters { items?: FoilInstance[] }
export const maxFoilsPerHull = 6;
export const placementLimits = { lateral: [-1.4, 1.4], yaw: [-180, 180] } as const;

export const foilDefaults: FoilDesign = {
  enabled: false, visualize: true, type: 'T', planform: 'tapered',
  span: 0.16, chord: 0.035, taper: 55, sweep: 12, cant: 8, thickness: 10,
  incidence: 5, immersion: 0.12, position: 45,
};

export const foilLimits = {
  span: [0.04, 0.6],
  chord: [0.015, 0.12],
  taper: [25, 100],
  sweep: [0, 35],
  cant: [0, 40],
  thickness: [6, 18],
  incidence: [-2, 10],
  immersion: [0.03, 0.4],
  position: [0, 100],
} as const;
export type FoilNumericKey = keyof typeof foilLimits;

export interface FoilConditions { speed: number; mass: number; rho: number; nu: number }

export function parseFoils(value: unknown): FoilDesign {
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
  const result: FoilDesign = {
    enabled: f.enabled, visualize: f.visualize, type: f.type as FoilType, planform: f.planform as FoilPlanform,
    span: f.span as number, chord: f.chord as number, taper: f.taper as number, sweep: f.sweep as number,
    cant: f.cant as number, thickness: f.thickness as number, incidence: f.incidence as number,
    immersion: f.immersion as number, position: f.position as number,
    speed: f.speed as number, mass: f.mass as number,
  };
  if (f.items !== undefined) {
    if (!Array.isArray(f.items) || f.items.length > 18) throw new Error('Ungueltige Foil-Liste.');
    const ids = new Set<string>();
    const counts = [0, 0, 0];
    result.items = f.items.map(value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungueltiger Einzel-Foil.');
      const item = value as Record<string, unknown>;
      if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 60 || ids.has(item.id) ||
          typeof item.hull !== 'number' || !Number.isInteger(item.hull) || item.hull < 0 || item.hull > 2 ||
          typeof item.mirrored !== 'boolean') throw new Error('Ungueltige Foil-ID oder Rumpfzuordnung.');
      ids.add(item.id);
      if (++counts[item.hull] > maxFoilsPerHull) throw new Error('Maximal 6 Foils pro Rumpf.');
      for (const key of ['lateral', 'yaw'] as const) {
        const number = item[key];
        const [min, max] = placementLimits[key];
        if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) throw new Error(`Ungueltige Foil-Position: ${key}.`);
      }
      if (item.items !== undefined) throw new Error('Verschachtelte Foil-Listen sind ungueltig.');
      return { ...parseFoils(item), id: item.id, hull: item.hull, lateral: item.lateral as number, yaw: item.yaw as number, mirrored: item.mirrored };
    });
  }
  return result;
}

export function foilChordFactor(f: FoilDesign, t: number) {
  const distance = f.type === 'T' ? Math.abs(2 * t - 1) : t;
  if (f.planform === 'elliptic') return Math.sqrt(Math.max(0, 1 - distance ** 2));
  if (f.planform === 'tapered') return 1 - distance * (1 - f.taper / 100);
  return 1;
}

export function foilIndicators(f: FoilParameters, c: FoilConditions, wings = 2) {
  const shapeFactor = f.planform === 'elliptic' ? Math.PI / 4 : f.planform === 'tapered' ? (1 + f.taper / 100) / 2 : 1;
  const area = wings * f.span * f.chord * shapeFactor;
  const meanChord = area / (wings * f.span);
  const aspectRatio = f.span ** 2 / (area / wings);
  const cl = 2 * Math.PI * (f.incidence * Math.PI / 180) * aspectRatio / (aspectRatio + 2);
  const re = (c.speed ?? f.speed ?? 1) * meanChord / c.nu;
  const cd0 = sectionDrag(re, f.thickness / 100);
  const cd = cd0 + cl ** 2 / (Math.PI * 0.8 * aspectRatio);
  const dynamicPressure = 0.5 * c.rho * (c.speed ?? f.speed ?? 1) ** 2;
  const verticalFactor = Math.cos(f.cant * Math.PI / 180);
  const lift = f.enabled ? dynamicPressure * area * cl * verticalFactor : 0;
  const drag = f.enabled ? dynamicPressure * area * cd : 0;
  const weight = (c.mass ?? f.mass ?? 1) * gravity;
  const fraction = lift / weight;
  const referenceSpeed = f.enabled && cl > 0 ? Math.sqrt(2 * weight / (c.rho * area * cl * verticalFactor)) : null;
  return { area, aspectRatio, cl, cd, cd0, re, lift, drag, weight, fraction, referenceSpeed };
}

export function foilSystemIndicators(f: FoilDesign, conditions: FoilConditions) {
  if (f.items === undefined) return { ...foilIndicators(f, conditions), foils: [] };
  const foils = f.items.map(item => {
    const projected = { ...item, enabled: f.enabled && item.enabled, incidence: item.incidence * Math.cos(item.yaw * Math.PI / 180) };
    return { item, ...foilIndicators(projected, conditions, 1) };
  });
  const lift = foils.reduce((sum, foil) => sum + foil.lift, 0);
  const drag = foils.reduce((sum, foil) => sum + foil.drag, 0);
  const area = foils.reduce((sum, foil) => sum + (f.enabled && foil.item.enabled ? foil.area : 0), 0);
  const weight = conditions.mass * gravity;
  const liftFactor = foils.reduce((sum, foil) => sum + (f.enabled && foil.item.enabled ? foil.area * foil.cl * Math.cos(foil.item.cant * Math.PI / 180) : 0), 0);
  const referenceSpeed = liftFactor > 0 ? Math.sqrt(2 * weight / (conditions.rho * liftFactor)) : null;
  return { area, lift, drag, weight, fraction: lift / weight, referenceSpeed, foils };
}
