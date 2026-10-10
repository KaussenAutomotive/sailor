import { Design } from './design';
import { HullSpec, hullSpecs, keelY } from './hullGeometry';

export type AppendageKind = 'fin' | 'board' | 'rudder';

export interface Appendage {
  kind: AppendageKind;
  x: number;
  z: number;
  top: number;
  depth: number;
  chord: number;
  thickness: number;
  lifting: boolean;
}

export interface Bulb { x: number; z: number; y: number; length: number; diameter: number }

const tAt = (h: HullSpec, x: number) => Math.min(1, Math.max(0, x / h.length + 0.5));

export function appendages(d: Design): { foils: Appendage[]; bulb: Bulb | null } {
  const specs = hullSpecs(d);
  const L = d.length;
  const list: Appendage[] = [];
  const add = (h: HullSpec, kind: AppendageKind, x: number, chord: number, depth: number) => {
    list.push({ kind, x, z: h.z, top: keelY(h, tAt(h, x)) + 0.004 * h.length, depth, chord, thickness: kind === 'rudder' ? 0.1 : 0.09, lifting: true });
  };
  const rudderDepth = Math.max(0.03, Math.min(d.finDepth * 0.5 + 0.02, 0.25));
  if (d.type === 'mono') {
    const h = specs[0];
    add(h, 'fin', -0.05 * L, 0.075 * L, d.finDepth);
    add(h, 'rudder', -0.42 * L, 0.055 * L, rudderDepth);
    const fin = list[0];
    const diameter = 0.036 * L;
    return { foils: list, bulb: { x: fin.x - 0.02 * L, z: 0, y: fin.top - fin.depth, length: 0.28 * L, diameter } };
  }
  if (d.type === 'cat') {
    specs.forEach(h => {
      add(h, 'board', -0.02 * h.length, 0.06 * h.length, d.finDepth);
      add(h, 'rudder', -0.45 * h.length, 0.05 * h.length, rudderDepth);
    });
  } else {
    add(specs[0], 'board', -0.03 * specs[0].length, 0.065 * specs[0].length, d.finDepth);
    add(specs[0], 'rudder', -0.44 * specs[0].length, 0.05 * specs[0].length, rudderDepth);
  }
  return { foils: list, bulb: null };
}

export function lowestPoint(d: Design) {
  const { foils, bulb } = appendages(d);
  return Math.min(...foils.map(a => a.top - a.depth), bulb ? bulb.y - bulb.diameter / 2 : Infinity);
}
