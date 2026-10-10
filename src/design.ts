import { FoilDesign, foilDefaults, foilLimits, parseFoils } from './foils';

export type HullType = 'mono' | 'cat' | 'tri';
export type HullShape = 'round' | 'chine' | 'slender';
export type SailShape = 'classic' | 'square';
export type WaterKind = 'fresh' | 'salt';
export type SectionKind = 'keel' | 'foil';

export interface FlowSettings {
  speed: number;
  leeway: number;
  water: WaterKind;
  waves: boolean;
  section: SectionKind;
}

export interface MassCenter { x: number; y: number; z: number }
export const massCenterDefaults: MassCenter = { x: 0, y: -0.05, z: 0 };
export const massCenterLimits = { x: [-1, 1], y: [-0.6, 0.4], z: [-1.4, 1.4] } as const;

// All lengths in metres, areas in m², mass in kg. The tool is scaled for model yachts up to 2 m.
export interface Design {
  version: 2;
  name: string;
  type: HullType;
  hullShape: HullShape;
  length: number;
  hullLengths?: number[];
  beam: number;
  hullDepth: number;
  finDepth: number;
  draft: number;
  wallThickness: number;
  mastPosition: number;
  mastHeight: number;
  mainArea: number;
  jibArea: number;
  sailShape: SailShape;
  camber: number;
  mass: number;
  hullColor: string;
  foils: FoilDesign;
  flow: FlowSettings;
  massCenter?: MassCenter;
}

export const flowDefaults: FlowSettings = { speed: 1, leeway: 4, water: 'fresh', waves: true, section: 'keel' };

export const presets: Design[] = [
  { version: 2, name: 'Aurelia 1000', type: 'mono', hullShape: 'round', length: 1, beam: 0.2, hullDepth: 0.11, finDepth: 0.33, draft: 0.5, wallThickness: 0.002, mastPosition: 38, mastHeight: 1.55, mainArea: 0.38, jibArea: 0.22, sailShape: 'classic', camber: 8, mass: 4, hullColor: '#42b8ad', foils: { ...foilDefaults }, flow: { ...flowDefaults } },
  { version: 2, name: 'Nomad 1200', type: 'cat', hullShape: 'slender', length: 1.2, beam: 0.75, hullDepth: 0.1, finDepth: 0.16, draft: 0.6, wallThickness: 0.002, mastPosition: 43, mastHeight: 1.7, mainArea: 0.45, jibArea: 0.2, sailShape: 'square', camber: 10, mass: 3, hullColor: '#5ba8d7', foils: { ...foilDefaults }, flow: { ...flowDefaults, speed: 1.4 } },
  { version: 2, name: 'Velocity 900', type: 'tri', hullShape: 'chine', length: 0.9, beam: 0.7, hullDepth: 0.1, finDepth: 0.2, draft: 0.4, wallThickness: 0.002, mastPosition: 40, mastHeight: 1.3, mainArea: 0.28, jibArea: 0.12, sailShape: 'square', camber: 6, mass: 2.2, hullColor: '#e2ab62', foils: { ...foilDefaults }, flow: { ...flowDefaults, speed: 1.2 } },
];

export const limits = {
  length: [0.3, 2],
  beam: [0.05, 1.4],
  hullDepth: [0.02, 0.4],
  finDepth: [0.02, 0.6],
  draft: [0.1, 2],
  wallThickness: [0.0004, 0.005],
  mastPosition: [25, 65],
  mastHeight: [0.15, 2.5],
  mainArea: [0.01, 1.2],
  jibArea: [0, 0.8],
  camber: [0, 18],
  mass: [0.1, 10],
} as const;
export type NumericKey = keyof typeof limits;

export const flowLimits = { speed: [0.1, 5], leeway: [0, 10] } as const;
export type FlowNumericKey = keyof typeof flowLimits;

const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

function parseBasics(d: Record<string, unknown>) {
  if (typeof d.name !== 'string' || !d.name.trim() || d.name.length > 60) throw new Error('Entwurfsname oder Dateiversion ist ungültig.');
  if (!['mono', 'cat', 'tri'].includes(String(d.type)) ||
      !['round', 'chine', 'slender'].includes(String(d.hullShape)) ||
      !['classic', 'square'].includes(String(d.sailShape)) ||
      typeof d.hullColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(d.hullColor)) throw new Error('Rumpf- oder Segelkonfiguration ist ungültig.');
  return { name: d.name.trim(), type: d.type as HullType, hullShape: d.hullShape as HullShape, sailShape: d.sailShape as SailShape, hullColor: d.hullColor, wallThickness: d.wallThickness as number };
}

export function parseFlow(value: unknown): FlowSettings {
  if (value === undefined) return { ...flowDefaults };
  if (!value || typeof value !== 'object') throw new Error('Ungültige Strömungseinstellungen.');
  const f = value as Record<string, unknown>;
  if (!['fresh', 'salt'].includes(String(f.water)) || typeof f.waves !== 'boolean' || !['keel', 'foil'].includes(String(f.section))) {
    throw new Error('Wasserart, Wellenbild oder Analyseprofil ist ungültig.');
  }
  for (const key of Object.keys(flowLimits) as FlowNumericKey[]) {
    const [min, max] = flowLimits[key];
    if (!finite(f[key], min, max)) throw new Error(`Ungültiger Strömungswert für ${key}: erlaubt sind ${min} bis ${max}.`);
  }
  return { speed: f.speed as number, leeway: f.leeway as number, water: f.water as WaterKind, waves: f.waves, section: f.section as SectionKind };
}

// Version-1 files described full-size yachts (6–20 m). They are scaled uniformly to a 1 m model.
const v1Limits = {
  length: [6, 20], beam: [2, 10], draft: [0.5, 3], mastPosition: [25, 65], mastHeight: [8, 26],
  mainArea: [12, 100], jibArea: [0, 65], camber: [0, 18],
} as const;
const v1FoilLimits = {
  span: [0.4, 3], chord: [0.12, 0.8], taper: [25, 100], sweep: [0, 35], cant: [0, 40], thickness: [6, 18],
  incidence: [-2, 10], immersion: [0.5, 2.5], position: [25, 70], speed: [0, 35], mass: [0.5, 25],
} as const;

function migrateV1(d: Record<string, unknown>): Design {
  const basics = parseBasics(d);
  for (const [key, [min, max]] of Object.entries(v1Limits)) {
    if (!finite(d[key], min, max)) throw new Error(`Ungültiger Wert für ${key}: erlaubt sind ${min} bis ${max}.`);
  }
  const n = (key: keyof typeof v1Limits) => d[key] as number;
  const k = 1 / n('length');
  let foils = { ...foilDefaults };
  let massTonnes = basics.type === 'mono' ? 6 : 4;
  let speedKnots = 6;
  if (d.foils !== undefined) {
    const f = d.foils as Record<string, unknown>;
    if (!f || typeof f !== 'object' || typeof f.enabled !== 'boolean' || typeof f.visualize !== 'boolean' ||
        !['T', 'L', 'V'].includes(String(f.type)) || !['straight', 'tapered', 'elliptic'].includes(String(f.planform))) {
      throw new Error('Hydrofoil-Typ oder Flügelform ist ungültig.');
    }
    for (const [key, [min, max]] of Object.entries(v1FoilLimits)) {
      if (!finite(f[key], min, max)) throw new Error(`Ungültiger Hydrofoil-Wert für ${key}: erlaubt sind ${min} bis ${max}.`);
    }
    const fn = (key: keyof typeof v1FoilLimits) => f[key] as number;
    massTonnes = fn('mass');
    speedKnots = Math.max(fn('speed'), 1);
    foils = {
      enabled: f.enabled, visualize: f.visualize, type: f.type as FoilDesign['type'], planform: f.planform as FoilDesign['planform'],
      span: clamp(fn('span') * k, foilLimits.span), chord: clamp(fn('chord') * k, foilLimits.chord),
      taper: fn('taper'), sweep: fn('sweep'), cant: fn('cant'), thickness: fn('thickness'), incidence: fn('incidence'),
      immersion: clamp(fn('immersion') * k, foilLimits.immersion), position: fn('position'),
    };
  }
  const hullWidth = basics.type === 'mono' ? n('beam') : Math.min(n('beam') * 0.22, n('length') * 0.12);
  const depth = Math.min(hullWidth * 0.46, 0.95, n('draft') * 0.65);
  return {
    version: 2, ...basics,
    length: 1,
    beam: clamp(n('beam') * k, limits.beam),
    hullDepth: clamp((depth + 0.33) * k, limits.hullDepth),
    finDepth: clamp((n('draft') - depth * 0.6) * k, limits.finDepth),
    draft: clamp(n('draft') * k, limits.draft),
    wallThickness: 0.002,
    mastPosition: n('mastPosition'),
    mastHeight: clamp(n('mastHeight') * k, limits.mastHeight),
    mainArea: clamp(n('mainArea') * k * k, limits.mainArea),
    jibArea: clamp(n('jibArea') * k * k, limits.jibArea),
    camber: n('camber'),
    mass: clamp(massTonnes * 1000 * k ** 3, limits.mass),
    foils,
    flow: { ...flowDefaults, speed: clamp(speedKnots * 0.514444 * Math.sqrt(k), flowLimits.speed) },
  };
}

export function parseDesignFile(text: string): { design: Design; migrated: boolean } {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Keine gültige Sailor-Datei.');
  const d = value as Record<string, unknown>;
  if (d.version === 1) return { design: migrateV1(d), migrated: true };
  if (d.version !== 2) throw new Error('Entwurfsname oder Dateiversion ist ungültig.');
  const basics = parseBasics(d);
  for (const key of Object.keys(limits) as NumericKey[]) {
    const [min, max] = limits[key];
    if (!finite(d[key], min, max)) throw new Error(`Ungültiger Wert für ${key}: erlaubt sind ${min} bis ${max}.`);
  }
  const n = (key: NumericKey) => d[key] as number;
  let massCenter: MassCenter | undefined;
  if (d.massCenter !== undefined) {
    if (!d.massCenter || typeof d.massCenter !== 'object' || Array.isArray(d.massCenter)) throw new Error('Ungueltiger Massenschwerpunkt.');
    const center = d.massCenter as Record<string, unknown>;
    for (const key of ['x', 'y', 'z'] as const) {
      const [min, max] = massCenterLimits[key];
      if (!finite(center[key], min, max)) throw new Error(`Ungueltiger Schwerpunktwert: ${key}.`);
    }
    massCenter = { x: center.x as number, y: center.y as number, z: center.z as number };
  }
  const foils = parseFoils(d.foils);
  const hullCount = basics.type === 'mono' ? 1 : basics.type === 'cat' ? 2 : 3;
  let hullLengths: number[] | undefined;
  if (d.hullLengths !== undefined) {
    if (!Array.isArray(d.hullLengths) || d.hullLengths.length !== hullCount || d.hullLengths.some(value => !finite(value, limits.length[0], limits.length[1]))) {
      throw new Error('Ungueltige Einzellaengen: je vorhandenem Rumpf 0,3 bis 2 m.');
    }
    hullLengths = d.hullLengths as number[];
    if (Math.abs(Math.max(...hullLengths) - n('length')) > 1e-9) throw new Error('Gesamtlaenge muss der Laenge des laengsten Rumpfs entsprechen.');
  }
  if (foils.items?.some(item => item.hull >= hullCount)) throw new Error('Foil ist einem nicht vorhandenen Rumpf zugeordnet.');
  return {
    design: {
      version: 2, ...basics,
      length: n('length'), beam: n('beam'), hullDepth: n('hullDepth'), finDepth: n('finDepth'),
      draft: n('draft'), wallThickness: n('wallThickness'),
      mastPosition: n('mastPosition'), mastHeight: n('mastHeight'), mainArea: n('mainArea'), jibArea: n('jibArea'),
      camber: n('camber'), mass: n('mass'),
      foils, flow: parseFlow(d.flow),
      ...(massCenter ? { massCenter } : {}),
      ...(hullLengths ? { hullLengths: [...hullLengths] } : {}),
    },
    migrated: false,
  };
}

export function parseDesign(text: string): Design {
  return parseDesignFile(text).design;
}

// X runs from stern (-L/2) to bow (+L/2); mast position is measured from the bow.
export function mastX(d: Design): number {
  const main = hullLayout(d).find(hull => hull.main)!;
  return main.length * (0.5 - d.mastPosition / 100);
}

export function sailDimensions(d: Design) {
  const height = d.mastHeight * 0.91;
  const topRatio = d.sailShape === 'square' ? 0.28 : 0;
  const foot = 2 * d.mainArea / (height * (1 + topRatio));
  const jibHeight = d.mastHeight * 0.8;
  return { height, foot, top: foot * topRatio, jibHeight, jibFoot: 2 * d.jibArea / jibHeight };
}

export interface HullPlacement { z: number; width: number; length: number; depth: number; yBase: number; main: boolean }

export function hullLayout(d: Design): HullPlacement[] {
  if (d.type === 'mono') return [{ z: 0, width: d.beam, length: d.length, depth: d.hullDepth, yBase: 0, main: true }];
  const width = Math.min(d.beam * 0.22, d.length * 0.12);
  if (d.type === 'cat') {
    return [-1, 1].map((sign, index) => ({ z: sign * (d.beam - width) / 2, width, length: d.hullLengths?.[index] ?? d.length, depth: d.hullDepth, yBase: 0, main: sign === 1 }));
  }
  const amaWidth = width * 0.7;
  return [
    { z: 0, width: Math.min(d.beam * 0.29, d.length * 0.23), length: d.hullLengths?.[0] ?? d.length, depth: d.hullDepth, yBase: 0, main: true },
    ...[-1, 1].map((sign, index) => ({ z: sign * (d.beam - amaWidth) / 2, width: amaWidth, length: d.hullLengths?.[index + 1] ?? d.length * 0.85, depth: d.hullDepth * 0.8, yBase: d.hullDepth * 0.3, main: false })),
  ];
}

export function setHullLength(d: Design, index: number, length: number): Design {
  const hullLengths = hullLayout(d).map(hull => clamp(hull.length, limits.length));
  if (!Number.isInteger(index) || index < 0 || index >= hullLengths.length || !finite(length, limits.length[0], limits.length[1])) throw new Error('Ungueltige Rumpflaenge.');
  hullLengths[index] = length;
  return { ...d, length: Math.max(...hullLengths), hullLengths: d.type === 'mono' ? undefined : hullLengths };
}

export function setHullType(d: Design, type: HullType): Design {
  const { hullLengths: previousLengths, ...base } = d;
  const next = { ...base, type };
  if (!previousLengths) return next;
  const previous = hullLayout(d);
  const lengths = hullLayout(next).map(hull => {
    const matching = previous.find(old => old.main === hull.main && (hull.main || Math.sign(old.z) === Math.sign(hull.z)));
    return clamp(matching?.length ?? hull.length, limits.length);
  });
  return { ...next, length: Math.max(...lengths), ...(type === 'mono' ? {} : { hullLengths: lengths }) };
}

export function indicators(d: Design) {
  const s = sailDimensions(d);
  const mx = mastX(d);
  const mainCenter = mx - (s.foot ** 2 + s.foot * s.top + s.top ** 2) / (3 * (s.foot + s.top));
  const jibCenter = mx + s.jibFoot / 3;
  const area = d.mainArea + d.jibArea;
  const center = (mainCenter * d.mainArea + jibCenter * d.jibArea) / area;
  const main = hullLayout(d).find(hull => hull.main)!;
  return {
    area,
    slenderness: main.length / main.width,
    center,
    overhang: s.foot > mx + main.length / 2 || s.jibFoot > main.length / 2 - mx,
  };
}
