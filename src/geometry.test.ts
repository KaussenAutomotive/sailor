import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildBoat } from './BoatScene';
import { presets } from './design';

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
  it('places the keel bottom exactly at the selected draft for every hull concept', () => {
    for (const preset of presets) {
      for (const draft of [0.5, 1.9, 3]) {
        const boat = buildBoat({ ...preset, draft }, false);
        const bounds = new THREE.Box3().setFromObject(boat);
        expect(bounds.min.y).toBeCloseTo(-draft, 5);
        expect([bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite)).toBe(true);
        release(boat);
      }
    }
  });
});
