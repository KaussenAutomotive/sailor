import earcut from 'earcut';
import { Design, limits } from './design';
import { HullSpec, Point2, deckY, hullSpecs, outerSkin, sectionPoints, stationX } from './hullGeometry';

export type Vec3 = [number, number, number];
export type ShellResolution = 'coarse' | 'standard' | 'fine';

export const shellResolutions: Record<ShellResolution, { label: string; stations: number; m: number }> = {
  coarse: { label: 'Grob', stations: 40, m: 16 },
  standard: { label: 'Standard', stations: 72, m: 24 },
  fine: { label: 'Fein', stations: 120, m: 32 },
};

export const wallLimits = { min: limits.wallThickness[0], max: limits.wallThickness[1] };

// Closed polyhedral solid: polygons with counter-clockwise vertex order seen from outside.
export interface ShellSolid { name: string; vertices: Vec3[]; faces: number[][] }

const sub = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Point2, b: Point2) => a[0] * b[0] + a[1] * b[1];

function inwardNormals(points: Point2[]): Point2[] {
  return points.slice(0, -1).map((p, j) => {
    const [dz, dy] = sub(points[j + 1], p);
    const length = Math.hypot(dz, dy) || 1;
    return [dy / length, -dz / length];
  });
}

function insidePolygon(point: Point2, polygon: Point2[]) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = [polygon[i], polygon[j]];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < a[0] + (point[1] - a[1]) / (b[1] - a[1]) * (b[0] - a[0])) hit = !hit;
  }
  return hit;
}

function signedArea(points: Point2[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [a, b] = [points[i], points[(i + 1) % points.length]];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

// Inner (offset) section at hull parameter t. The offset is measured normal to the 3D surface;
// deck-edge points move horizontally so the wall top lies in the deck plane. Returns null if the
// section is too small for the requested wall thickness.
export function innerSection(h: HullSpec, t: number, thickness: number, m: number): Point2[] | null {
  const outer = sectionPoints(h, t, m);
  const dt = 2e-3;
  const [t0, t1] = [Math.max(0, t - dt), Math.min(1, t + dt)];
  const behind = sectionPoints(h, t0, m);
  const ahead = sectionPoints(h, t1, m);
  const dx = stationX(h, t1) - stationX(h, t0);
  const normals = inwardNormals(outer);
  const offsets = normals.map((n, j) => {
    const slope: Point2 = [
      ((ahead[j][0] + ahead[j + 1][0]) - (behind[j][0] + behind[j + 1][0])) / (2 * dx),
      ((ahead[j][1] + ahead[j + 1][1]) - (behind[j][1] + behind[j + 1][1])) / (2 * dx),
    ];
    const a = dot(n, slope);
    return Math.min(3 * thickness, thickness * Math.sqrt(1 + a * a));
  });
  const top = outer[0][1];
  const cap = (v: Point2): Point2 => {
    const length = Math.hypot(v[0], v[1]);
    return length > 3 * thickness ? [v[0] / length * 3 * thickness, v[1] / length * 3 * thickness] : v;
  };
  const inner = outer.map((p, j): Point2 => {
    if (j === 0 || j === m) {
      const s = j === 0 ? 0 : m - 1;
      const n = normals[s];
      const shift = Math.abs(n[0]) > 0.2 ? offsets[s] / n[0] : Math.sign(n[0] || (j === 0 ? -1 : 1)) * offsets[s];
      const [z] = cap([shift, 0]);
      return [p[0] + z, top];
    }
    const [n1, n2] = [normals[j - 1], normals[j]];
    const [o1, o2] = [offsets[j - 1], offsets[j]];
    const det = n1[0] * n2[1] - n1[1] * n2[0];
    let v: Point2;
    if (Math.abs(det) < 1e-6) {
      const o = (o1 + o2) / 2;
      const mean: Point2 = [n1[0] + n2[0], n1[1] + n2[1]];
      const length = Math.hypot(mean[0], mean[1]) || 1;
      v = [mean[0] / length * o, mean[1] / length * o];
    } else {
      v = [(o1 * n2[1] - o2 * n1[1]) / det, (n1[0] * o2 - n2[0] * o1) / det];
    }
    v = cap(v);
    return [p[0] + v[0], p[1] + v[1]];
  });
  if (inner[0][0] - inner[m][0] < 0.5 * thickness) return null;
  for (let j = 0; j < m; j++) {
    const a = sub(outer[j + 1], outer[j]);
    const b = sub(inner[j + 1], inner[j]);
    if (dot(a, b) <= 0) return null;
  }
  for (let j = 1; j < m; j++) if (!insidePolygon(inner[j], outer) || top - inner[j][1] < 0.5 * thickness) return null;
  if (Math.sign(signedArea(inner)) !== Math.sign(signedArea(outer)) || Math.abs(signedArea(inner)) < thickness ** 2) return null;
  return inner;
}

function newell(vertices: Vec3[], loop: number[]): Vec3 {
  const n: Vec3 = [0, 0, 0];
  loop.forEach((index, k) => {
    const a = vertices[index];
    const b = vertices[loop[(k + 1) % loop.length]];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  });
  return n;
}

export function hullShell(h: HullSpec, thickness: number, resolution: ShellResolution = 'standard', name = 'Rumpf'): ShellSolid {
  if (!(thickness >= wallLimits.min && thickness <= wallLimits.max)) throw new Error('Wandstärke muss zwischen 0,4 und 5 mm liegen.');
  const { stations, m } = shellResolutions[resolution];
  const tA = thickness / h.length;
  const skin = outerSkin(h, stations, m, [tA]);
  const N = skin.stations.length - 1;
  const vertices: Vec3[] = [];
  for (let i = 0; i < skin.positions.length; i += 3) vertices.push([skin.positions[i], skin.positions[i + 1], skin.positions[i + 2]]);
  const outerIndex = (k: number, i: number) => k === N ? N * (m + 1) + Math.min(i, m - i) : k * (m + 1) + i;
  const faces: number[][] = [];
  for (let i = 0; i < skin.indices.length; i += 3) faces.push([skin.indices[i], skin.indices[i + 1], skin.indices[i + 2]]);

  const innerTs: number[] = [];
  const innerSections: Point2[][] = [];
  const first = innerSection(h, tA, thickness, m);
  if (!first) throw new Error('Wandstärke zu groß für diesen Rumpf: Heckbereich zu klein. Bitte Wandstärke verringern.');
  innerTs.push(tA);
  innerSections.push(first);
  for (const t of skin.stations) {
    if (t <= tA + 0.2 * thickness / h.length || t >= 1) continue;
    const section = innerSection(h, t, thickness, m);
    if (!section) break;
    innerTs.push(t);
    innerSections.push(section);
  }
  if (innerSections.length < 3) throw new Error('Wandstärke zu groß: Der Innenraum ist zu klein. Bitte Wandstärke verringern oder Rumpf vergrößern.');
  const innerBase = vertices.length;
  innerSections.forEach((section, k) => {
    const x = stationX(h, innerTs[k]);
    section.forEach(([z, y]) => vertices.push([x, y, z]));
  });
  const innerIndex = (k: number, i: number) => innerBase + k * (m + 1) + i;
  const K = innerSections.length - 1;
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < m; i++) {
      const [a, b, c, d] = [innerIndex(k, i), innerIndex(k, i + 1), innerIndex(k + 1, i + 1), innerIndex(k + 1, i)];
      faces.push([a, c, b], [a, d, c]);
    }
  }
  const planar = (loop: number[], expected: Vec3) => {
    const n = newell(vertices, loop);
    faces.push(n[0] * expected[0] + n[1] * expected[1] + n[2] * expected[2] >= 0 ? loop : [...loop].reverse());
  };
  planar(Array.from({ length: m + 1 }, (_, i) => outerIndex(0, i)), [-1, 0, 0]);
  planar(Array.from({ length: m + 1 }, (_, i) => innerIndex(0, i)), [1, 0, 0]);
  planar(Array.from({ length: m + 1 }, (_, i) => innerIndex(K, i)), [-1, 0, 0]);

  const outerRing = [
    ...Array.from({ length: N + 1 }, (_, k) => outerIndex(k, 0)),
    ...Array.from({ length: N }, (_, k) => outerIndex(N - 1 - k, m)),
  ];
  const innerRing = [
    ...Array.from({ length: K + 1 }, (_, k) => innerIndex(k, 0)),
    ...Array.from({ length: K + 1 }, (_, k) => innerIndex(K - k, m)),
  ];
  const ring = [...outerRing, ...innerRing];
  const flat = ring.flatMap(index => [vertices[index][0], vertices[index][2]]);
  const triangles = earcut(flat, [outerRing.length]);
  for (let i = 0; i < triangles.length; i += 3) {
    const loop = [ring[triangles[i]], ring[triangles[i + 1]], ring[triangles[i + 2]]];
    const n = newell(vertices, loop);
    faces.push(n[1] >= 0 ? loop : [loop[0], loop[2], loop[1]]);
  }
  const solid = { name, vertices, faces };
  validateSolid(solid);
  return solid;
}

export function solidVolume(solid: ShellSolid) {
  let volume = 0;
  for (const face of solid.faces) {
    const a = solid.vertices[face[0]];
    for (let k = 1; k < face.length - 1; k++) {
      const b = solid.vertices[face[k]];
      const c = solid.vertices[face[k + 1]];
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return volume;
}

export function validateSolid(solid: ShellSolid) {
  const edges = new Map<string, number>();
  for (const face of solid.faces) {
    if (new Set(face).size !== face.length) throw new Error('Ungültige Fläche im Volumenmodell.');
    face.forEach((a, k) => {
      const key = `${a}>${face[(k + 1) % face.length]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    });
  }
  for (const [key, count] of edges) {
    const [a, b] = key.split('>');
    if (count !== 1 || edges.get(`${b}>${a}`) !== 1) throw new Error('Volumenmodell ist nicht geschlossen (Wandstärke zu groß?).');
  }
  if (solidVolume(solid) <= 0) throw new Error('Volumenmodell ist falsch orientiert.');
}

export interface ShellExport { solids: ShellSolid[]; volume: number; faces: number; xStern: number }

export function designShells(d: Design, thickness: number, resolution: ShellResolution, scope: 'all' | 'main'): ShellExport {
  const specs = hullSpecs(d).filter(h => scope === 'all' || h.main);
  const names = specs.length === 1 ? ['Rumpf'] : specs.map(h => h.main ? 'Hauptrumpf' : h.z > 0 ? 'Rumpf Steuerbord' : 'Rumpf Backbord');
  if (d.type === 'cat') names.splice(0, names.length, ...specs.map(h => h.z > 0 ? 'Rumpf Steuerbord' : 'Rumpf Backbord'));
  const solids = specs.map((h, n) => hullShell(h, thickness, resolution, names[n]));
  return {
    solids,
    volume: solids.reduce((sum, s) => sum + solidVolume(s), 0),
    faces: solids.reduce((sum, s) => sum + s.faces.length, 0),
    xStern: Math.min(...specs.map(h => stationX(h, 0))),
  };
}

export function midshipSection(h: HullSpec, thickness: number) {
  const m = 32;
  const outer = sectionPoints(h, 0.5, m);
  let inner: Point2[] | null = null;
  try { inner = innerSection(h, 0.5, thickness, m); } catch { inner = null; }
  return { outer, inner, deck: deckY(h, 0.5) };
}
