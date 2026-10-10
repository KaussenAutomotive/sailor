import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildBoat } from './BoatScene';
import { hullLayout, presets } from './design';
import { displacementMoments, equilibrium } from './hullGeometry';
import { appendages, lowestPoint } from './appendages';
import { foilMounts } from './foilGeometry';

function projectedArea(geometry: THREE.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const indices = geometry.getIndex()!;
  let area = 0;
  for (let i = 0; i < indices.count; i += 3) {
    const [a, b, c] = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
    area += Math.abs(
      (positions.getX(b) - positions.getX(a)) * (positions.getY(c) - positions.getY(a)) -
      (positions.getY(b) - positions.getY(a)) * (positions.getX(c) - positions.getX(a)),
    ) / 2;
  }
  return area;
}

function release(boat: THREE.Group) {
  boat.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => m.dispose());
    }
  });
}

describe('Rendered boat geometry', () => {
  it('positioniert Anhaenge und Foil-Paare relativ zu unterschiedlich langen Rümpfen', () => {
    const design = { ...presets[1], length: 1.5, hullLengths: [0.5, 1.5] };
    const hulls = hullLayout(design);
    for (const appendage of appendages(design).foils) {
      const hull = hulls.find(hull => hull.z === appendage.z)!;
      expect(Math.abs(appendage.x)).toBeLessThan(hull.length / 2);
      expect(appendage.x).toBeCloseTo(hull.length * (appendage.kind === 'rudder' ? -0.45 : -0.02));
    }
    const mounts = foilMounts(design, -0.1);
    mounts.forEach(mount => expect(mount.x).toBeCloseTo(hulls[mount.hull].length * (0.5 - design.foils.position / 100)));
    const boat = buildBoat(design, false);
    const bounds = new THREE.Box3().setFromObject(boat);
    expect([bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite)).toBe(true);
    release(boat);
  });
  it('zeigt Massenschwerpunkt und Volumenschwerpunkt im Bootsrahmen', () => {
    const design = { ...presets[0], massCenter: { x: -0.035, y: -0.09, z: 0.012 } };
    const hydro = equilibrium(design);
    const boat = buildBoat(design, false, hydro, true);
    const cg = boat.getObjectByName('mass-center')!;
    const cb = boat.getObjectByName('buoyancy-center')!;
    expect(cg.position.toArray()).toEqual([-0.035, -0.09, 0.012]);
    const center = displacementMoments(hydro.prepared, hydro.level).center;
    expect(cb.position.toArray()).toEqual([center.x, center.y, center.z]);
    expect(boat.getObjectByName('weight-force')).toBeDefined();
    expect(boat.getObjectByName('buoyancy-force')).toBeDefined();
    expect(boat.position.y).toBeCloseTo(-hydro.level);
    release(boat);
  });
  it('renders precisely the requested projected main and jib sail areas', () => {
    for (const sailShape of ['classic', 'square'] as const) {
      const d = { ...presets[0], sailShape, camber: 18 };
      const boat = buildBoat(d, false);
      const main = boat.getObjectByName('main-sail') as THREE.Mesh;
      const jib = boat.getObjectByName('jib-sail') as THREE.Mesh;
      expect(projectedArea(main.geometry)).toBeCloseTo(d.mainArea, 4);
      expect(projectedArea(jib.geometry)).toBeCloseTo(d.jibArea, 4);
      release(boat);
    }
  });
  it('omits jib geometry when its area is zero', () => {
    const boat = buildBoat({ ...presets[0], jibArea: 0 }, false);
    expect(boat.getObjectByName('jib-sail')).toBeUndefined();
    release(boat);
  });
  it('places appendages relative to the hydrostatic waterline for every model concept', () => {
    for (const preset of presets) {
      for (const finDepth of [0.02, 0.2, 0.6]) {
        const design = { ...preset, finDepth };
        const hydro = equilibrium(design);
        const boat = buildBoat(design, false, hydro);
        const bounds = new THREE.Box3().setFromObject(boat);
        expect(bounds.min.y).toBeCloseTo(lowestPoint(design) - hydro.level, 5);
        expect([bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite)).toBe(true);
        release(boat);
      }
    }
  });
});
