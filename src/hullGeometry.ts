import { Design, HullPlacement, HullShape, hullLayout } from './design';
import { foilSystemIndicators } from './foils';
import { gravity, waterProperties } from './flow/water';

export interface HullSpec extends HullPlacement { shape: HullShape }
export type Point2 = [number, number];

export function hullSpecs(d: Design): HullSpec[] {
  return hullLayout(d).map(h => ({ ...h, shape: d.hullShape }));
}

// t runs from the transom (0) to the stem (1).
export function stationX(h: HullSpec, t: number) {
  return (t - 0.5) * h.length;
}

export function halfWidth(h: HullSpec, t: number) {
  if (t >= 1) return 0;
  const exponent = h.shape === 'slender' ? 0.85 : 0.58;
  return h.width / 2 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.13 + 0.87 * t))), exponent);
}

export function deckY(h: HullSpec, t: number) {
  return h.yBase + h.depth * (1 + 0.12 * t ** 4);
}

export function keelY(h: HullSpec, t: number) {
  const rocker = 0.25 + 0.75 * Math.sqrt(Math.max(0, 1 - ((t - 0.55) / 0.55) ** 2));
  return deckY(h, t) - h.depth * rocker;
}

// Section shape as (width fraction, depth fraction) for s from deck edge (0) to keel centreline (1).
export function sectionFraction(shape: HullShape, s: number): Point2 {
  const a = s * Math.PI / 2;
  if (shape === 'chine') {
    if (s <= 0.5) return [1 - 0.08 * s / 0.5, 0.58 * s / 0.5];
    const u = (s - 0.5) / 0.5;
    return [0.92 * (1 - u), 0.58 + 0.42 * u];
  }
  if (shape === 'slender') return [0.5 * Math.cos(a) + 0.5 * (1 - s), 0.55 * Math.sin(a) + 0.45 * s];
  return [Math.cos(a), Math.sin(a)];
}

// Section points (z, y) in boat coordinates, i = 0..m from starboard deck edge over the keel to port deck edge.
export function sectionPoints(h: HullSpec, t: number, m: number): Point2[] {
  const w = halfWidth(h, t);
  const top = deckY(h, t);
  const depth = top - keelY(h, t);
  const half = m / 2;
  return Array.from({ length: m + 1 }, (_, i) => {
    const side = i <= half ? 1 : -1;
    const [zf, df] = sectionFraction(h.shape, i <= half ? i / half : (m - i) / half);
    return [h.z + side * zf * w, top - df * depth];
  });
}

export function stationParameters(count: number) {
  return Array.from({ length: count + 1 }, (_, k) => 1 - (1 - k / count) ** 1.4);
}

export interface HullMesh { positions: number[]; indices: number[]; stations: number[]; m: number }

// Outer skin; the stem collapses to a shared edge so the surface is closed at the bow.
export function outerSkin(h: HullSpec, stationCount: number, m: number, extraStations: readonly number[] = []): HullMesh {
  const stations = [...new Set([...stationParameters(stationCount), ...extraStations.filter(t => t > 0 && t < 1)])].sort((left, right) => left - right);
  const lastStation = stations.length - 1;
  const positions: number[] = [];
  const indices: number[] = [];
  const index = (k: number, i: number) => k === lastStation ? lastStation * (m + 1) + Math.min(i, m - i) : k * (m + 1) + i;
  stations.forEach((t, k) => {
    const x = stationX(h, t);
    const points = sectionPoints(h, t, m);
    const count = k === lastStation ? m / 2 + 1 : m + 1;
    for (let i = 0; i < count; i++) positions.push(x, points[i][1], points[i][0]);
  });
  for (let k = 0; k < lastStation; k++) {
    for (let i = 0; i < m; i++) {
      const a = index(k, i);
      const b = index(k, i + 1);
      const c = index(k + 1, i + 1);
      const d = index(k + 1, i);
      indices.push(a, b, c, a, c, d);
    }
  }
  return { positions, indices, stations, m };
}


function clipBelow(points: Point2[], level: number): Point2[] {
  const out: Point2[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const aIn = a[1] <= level;
    const bIn = b[1] <= level;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const r = (level - a[1]) / (b[1] - a[1]);
      out.push([a[0] + r * (b[0] - a[0]), level]);
    }
  }
  return out;
}

export function polygonArea(points: Point2[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}

// Half breadth of the hull section at height y (0 below the keel, deck half breadth above the deck).
export function halfBreadthAt(h: HullSpec, t: number, y: number, m = 32) {
  const points = sectionPoints(h, t, m).slice(0, m / 2 + 1);
  if (y >= points[0][1]) return points[0][0] - h.z;
  for (let i = 0; i < points.length - 1; i++) {
    const [z0, y0] = points[i];
    const [z1, y1] = points[i + 1];
    if (y <= y0 && y >= y1) return y0 === y1 ? z0 - h.z : z0 - h.z + (y - y0) / (y1 - y0) * (z1 - z0);
  }
  return 0;
}

export interface PreparedHull { spec: HullSpec; ts: number[]; xs: number[]; sections: Point2[][]; bottom: number; skin: HullMesh }

const hydroStations = 72;
const hydroSection = 32;

export function hullBottom(h: HullSpec) {
  let min = Infinity;
  for (let k = 0; k <= 400; k++) min = Math.min(min, keelY(h, k / 400));
  return min;
}

export function prepareHull(spec: HullSpec): PreparedHull {
  const ts = stationParameters(hydroStations);
  return {
    spec, ts,
    xs: ts.map(t => stationX(spec, t)),
    sections: ts.map(t => sectionPoints(spec, t, hydroSection)),
    bottom: hullBottom(spec),
    skin: outerSkin(spec, hydroStations, hydroSection),
  };
}

function sectionAreas(p: PreparedHull, level: number) {
  return p.sections.map((points, k) => p.ts[k] >= 1 ? 0 : polygonArea(clipBelow(points, level)));
}

export function submergedVolume(p: PreparedHull, level: number) {
  const areas = sectionAreas(p, level);
  let volume = 0;
  for (let k = 0; k < areas.length - 1; k++) volume += (areas[k] + areas[k + 1]) / 2 * (p.xs[k + 1] - p.xs[k]);
  return volume;
}

export function displacementMoments(hulls: PreparedHull[], level: number) {
  let volume = 0;
  const moment = { x: 0, y: 0, z: 0 };
  let waterplaneArea = 0;
  let waterplaneX = 0;
  let waterplaneZ = 0;
  let waterplaneXX = 0;
  let waterplaneZZ = 0;
  for (const hull of hulls) {
    const stations = hull.sections.map((section, index) => {
      const polygon = clipBelow(section, level);
      let twiceArea = 0;
      let centroidZ = 0;
      let centroidY = 0;
      polygon.forEach((point, position) => {
        const next = polygon[(position + 1) % polygon.length];
        const product = point[0] * next[1] - next[0] * point[1];
        twiceArea += product;
        centroidZ += (point[0] + next[0]) * product;
        centroidY += (point[1] + next[1]) * product;
      });
      const area = Math.abs(twiceArea) / 2;
      const t = hull.ts[index];
      const width = level > keelY(hull.spec, t) && level < deckY(hull.spec, t) ? halfBreadthAt(hull.spec, t, level) : 0;
      return { area, x: hull.xs[index], y: Math.abs(twiceArea) > 1e-14 ? centroidY / (3 * twiceArea) : 0,
        z: Math.abs(twiceArea) > 1e-14 ? centroidZ / (3 * twiceArea) : 0, width };
    });
    for (let index = 0; index < stations.length - 1; index++) {
      const first = stations[index];
      const second = stations[index + 1];
      const halfLength = (second.x - first.x) / 2;
      volume += (first.area + second.area) * halfLength;
      for (const axis of ['x', 'y', 'z'] as const) moment[axis] += (first.area * first[axis] + second.area * second[axis]) * halfLength;
      waterplaneArea += 2 * (first.width + second.width) * halfLength;
      waterplaneX += 2 * (first.width * first.x + second.width * second.x) * halfLength;
      waterplaneZ += 2 * (first.width + second.width) * hull.spec.z * halfLength;
      waterplaneXX += 2 * (first.width * first.x ** 2 + second.width * second.x ** 2) * halfLength;
      waterplaneZZ += (2 * (first.width + second.width) * hull.spec.z ** 2 + 2 / 3 * (first.width ** 3 + second.width ** 3)) * halfLength;
    }
  }
  return { volume,
    center: volume > 0 ? { x: moment.x / volume, y: moment.y / volume, z: moment.z / volume } : { x: 0, y: level, z: 0 },
    waterplaneArea,
    pitchInertia: Math.max(0, waterplaneXX - (waterplaneArea > 0 ? waterplaneX ** 2 / waterplaneArea : 0)),
    rollInertia: Math.max(0, waterplaneZZ - (waterplaneArea > 0 ? waterplaneZ ** 2 / waterplaneArea : 0)),
  };
}

export interface HullHydro {
  volume: number;
  wetted: number;
  lwl: number;
  bwl: number;
  draft: number;
  cb: number;
  lcb: number;
  xAft: number;
  xFwd: number;
  transomDepth: number;
}

export function wettedArea(p: PreparedHull, level: number) {
  const { positions: v, indices } = p.skin;
  let wetted = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [0, 1, 2].map(j => {
      const o = indices[i + j] * 3;
      return [v[o], v[o + 1], v[o + 2]];
    });
    if (tri.every(q => q[1] >= level)) continue;
    const below: number[][] = [];
    for (let j = 0; j < 3; j++) {
      const a = tri[j];
      const b = tri[(j + 1) % 3];
      if (a[1] <= level) below.push(a);
      if ((a[1] <= level) !== (b[1] <= level)) {
        const r = (level - a[1]) / (b[1] - a[1]);
        below.push([a[0] + r * (b[0] - a[0]), level, a[2] + r * (b[2] - a[2])]);
      }
    }
    for (let j = 1; j < below.length - 1; j++) {
      const [a, b, c] = [below[0], below[j], below[j + 1]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      wetted += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    }
  }
  return wetted;
}

export function hullHydrostatics(p: PreparedHull, level: number): HullHydro {
  const h = p.spec;
  const areas = sectionAreas(p, level);
  let volume = 0;
  let moment = 0;
  for (let k = 0; k < areas.length - 1; k++) {
    const dx = p.xs[k + 1] - p.xs[k];
    volume += (areas[k] + areas[k + 1]) / 2 * dx;
    moment += (areas[k] * p.xs[k] + areas[k + 1] * p.xs[k + 1]) / 2 * dx;
  }
  let xAft = Infinity;
  let xFwd = -Infinity;
  const fine = 400;
  for (let k = 0; k < fine; k++) {
    const t = k / fine;
    if (keelY(h, t) < level) {
      xAft = Math.min(xAft, stationX(h, t));
      xFwd = Math.max(xFwd, stationX(h, t));
    }
  }
  let bwl = 0;
  p.ts.forEach(t => { if (t < 1) bwl = Math.max(bwl, 2 * halfBreadthAt(h, t, level, hydroSection)); });
  const lwl = Number.isFinite(xAft) ? xFwd - xAft : 0;
  const draft = Math.max(0, level - p.bottom);
  return {
    volume,
    wetted: wettedArea(p, level),
    lwl, bwl, draft,
    cb: lwl > 0 && bwl > 0 && draft > 0 ? volume / (lwl * bwl * draft) : 0,
    lcb: volume > 0 ? moment / volume : 0,
    xAft: Number.isFinite(xAft) ? xAft : 0,
    xFwd: Number.isFinite(xFwd) ? xFwd : 0,
    transomDepth: Math.max(0, level - keelY(h, 0)),
  };
}

export interface Equilibrium {
  level: number;
  restLevel: number;
  hulls: HullHydro[];
  prepared: PreparedHull[];
  volume: number;
  wetted: number;
  lift: number;
  overloaded: boolean;
  flying: boolean;
  freeboard: number;
  main: HullHydro;
  canoeDraft: number;
}

function solveLevel(hulls: PreparedHull[], requiredVolume: number) {
  const bottom = Math.min(...hulls.map(p => p.bottom));
  const top = Math.min(...hulls.map(p => Math.min(deckY(p.spec, 0), deckY(p.spec, 1))));
  const total = (level: number) => hulls.reduce((sum, p) => sum + submergedVolume(p, level), 0);
  if (requiredVolume <= 0) return { level: bottom, overloaded: false, flying: true };
  if (total(top) < requiredVolume) return { level: top, overloaded: true, flying: false };
  let lo = bottom;
  let hi = top;
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    if (total(mid) < requiredVolume) lo = mid; else hi = mid;
  }
  return { level: (lo + hi) / 2, overloaded: false, flying: false };
}

const preparedCache = new Map<string, PreparedHull[]>();

export function preparedHulls(d: Design): PreparedHull[] {
  const specs = hullSpecs(d);
  const key = JSON.stringify(specs);
  let hulls = preparedCache.get(key);
  if (!hulls) {
    hulls = specs.map(prepareHull);
    if (preparedCache.size > 24) preparedCache.clear();
    preparedCache.set(key, hulls);
  }
  return hulls;
}

// Floating position for the design mass minus the vertical foil lift at the given speed.
export function equilibrium(d: Design, speed = d.flow.speed): Equilibrium {
  const prepared = preparedHulls(d);
  const water = waterProperties(d.flow.water);
  const rest = solveLevel(prepared, d.mass / water.rho);
  const lift = foilSystemIndicators(d.foils, { speed, mass: d.mass, rho: water.rho, nu: water.nu }).lift;
  const state = lift !== 0 ? solveLevel(prepared, (d.mass * gravity - lift) / (water.rho * gravity)) : rest;
  const hulls = prepared.map(p => hullHydrostatics(p, state.level));
  const mainIndex = Math.max(0, prepared.findIndex(p => p.spec.main));
  return {
    level: state.level,
    restLevel: rest.level,
    hulls,
    prepared,
    volume: hulls.reduce((s, h) => s + h.volume, 0),
    wetted: hulls.reduce((s, h) => s + h.wetted, 0),
    lift,
    overloaded: state.overloaded,
    flying: state.flying,
    freeboard: Math.min(...prepared.map(p => deckY(p.spec, 0.5))) - state.level,
    main: hulls[mainIndex],
    canoeDraft: Math.max(0, state.level - Math.min(...prepared.map(p => p.bottom))),
  };
}
