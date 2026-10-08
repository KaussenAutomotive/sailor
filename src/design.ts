export type HullType = 'mono' | 'cat' | 'tri';
export type HullShape = 'round' | 'chine' | 'slender';
export type SailShape = 'classic' | 'square';

export interface Design {
  version: 1;
  name: string;
  type: HullType;
  hullShape: HullShape;
  length: number;
  beam: number;
  draft: number;
  mastPosition: number;
  mastHeight: number;
  mainArea: number;
  jibArea: number;
  sailShape: SailShape;
  camber: number;
  hullColor: string;
}

export const presets: Design[] = [
  { version: 1, name: 'Aurelia 38', type: 'mono', hullShape: 'round', length: 11.6, beam: 3.8, draft: 1.9, mastPosition: 42, mastHeight: 15, mainArea: 38, jibArea: 26, sailShape: 'classic', camber: 8, hullColor: '#42b8ad' },
  { version: 1, name: 'Nomad 42', type: 'cat', hullShape: 'slender', length: 12.8, beam: 6.8, draft: 1.1, mastPosition: 43, mastHeight: 17, mainArea: 52, jibArea: 30, sailShape: 'square', camber: 10, hullColor: '#5ba8d7' },
  { version: 1, name: 'Velocity 30', type: 'tri', hullShape: 'chine', length: 9.2, beam: 6.4, draft: 1.3, mastPosition: 40, mastHeight: 13, mainArea: 32, jibArea: 18, sailShape: 'square', camber: 6, hullColor: '#e2ab62' },
];

export const limits = {
  length: [6, 20],
  beam: [2, 10],
  draft: [0.5, 3],
  mastPosition: [25, 65],
  mastHeight: [8, 26],
  mainArea: [12, 100],
  jibArea: [0, 65],
  camber: [0, 18],
} as const;
export type NumericKey = keyof typeof limits;

export function parseDesign(text: string): Design {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object') throw new Error('Keine gültige Sailor-Datei.');
  const d = value as Record<string, unknown>;
  if (d.version !== 1 || typeof d.name !== 'string' || !d.name.trim() || d.name.length > 60) throw new Error('Entwurfsname oder Dateiversion ist ungültig.');
  if (!['mono', 'cat', 'tri'].includes(String(d.type)) ||
      !['round', 'chine', 'slender'].includes(String(d.hullShape)) ||
      !['classic', 'square'].includes(String(d.sailShape)) ||
      typeof d.hullColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(d.hullColor)) throw new Error('Rumpf- oder Segelkonfiguration ist ungültig.');
  for (const key of Object.keys(limits) as NumericKey[]) {
    const n = d[key];
    const [min, max] = limits[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new Error(`Ungültiger Wert für ${key}: erlaubt sind ${min} bis ${max}.`);
  }
  return {
    version: 1, name: d.name.trim(), type: d.type as HullType, hullShape: d.hullShape as HullShape,
    length: d.length as number, beam: d.beam as number, draft: d.draft as number,
    mastPosition: d.mastPosition as number, mastHeight: d.mastHeight as number,
    mainArea: d.mainArea as number, jibArea: d.jibArea as number,
    sailShape: d.sailShape as SailShape, camber: d.camber as number, hullColor: d.hullColor,
  };
}

// X runs from stern (-L/2) to bow (+L/2); mast position is measured from the bow.
export function mastX(d: Design): number {
  return d.length * (0.5 - d.mastPosition / 100);
}

export function sailDimensions(d: Design) {
  const height = d.mastHeight * 0.91;
  const topRatio = d.sailShape === 'square' ? 0.28 : 0;
  const foot = 2 * d.mainArea / (height * (1 + topRatio));
  const jibHeight = d.mastHeight * 0.8;
  return { height, foot, top: foot * topRatio, jibHeight, jibFoot: 2 * d.jibArea / jibHeight };
}

export function hullLayout(d: Design): { z: number; width: number; length: number }[] {
  if (d.type === 'mono') return [{ z: 0, width: d.beam, length: d.length }];
  const width = Math.min(d.beam * 0.22, d.length * 0.12);
  if (d.type === 'cat') return [-1, 1].map(sign => ({ z: sign * (d.beam - width) / 2, width, length: d.length }));
  const amaWidth = width * 0.7;
  return [
    { z: 0, width: Math.min(d.beam * 0.29, d.length * 0.23), length: d.length },
    ...[-1, 1].map(sign => ({ z: sign * (d.beam - amaWidth) / 2, width: amaWidth, length: d.length * 0.85 })),
  ];
}

export function indicators(d: Design) {
  const s = sailDimensions(d);
  const mx = mastX(d);
  const mainCenter = mx - s.foot / 3;
  const jibCenter = mx + s.jibFoot / 3;
  const area = d.mainArea + d.jibArea;
  const center = (mainCenter * d.mainArea + jibCenter * d.jibArea) / area;
  return {
    area,
    hullSpeed: 2.43 * Math.sqrt(d.length * 0.92),
    slenderness: d.length / hullLayout(d)[0].width,
    center,
    overhang: s.foot > mx + d.length / 2 || s.jibFoot > d.length / 2 - mx,
  };
}
