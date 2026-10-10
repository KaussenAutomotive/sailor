import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { presets } from './design';
import { hullSpecs, prepareHull, submergedVolume, deckY, outerSkin } from './hullGeometry';
import { designShells, hullShell, innerSection, midshipSection, shellResolutions, solidVolume, validateSolid } from './shell';
import { cadTransform, stepReal, writeStep } from './step';

const require = createRequire(import.meta.url);

interface OcctMesh { attributes: { position: { array: number[] } }; index: { array: number[] } }
interface OcctResult { success: boolean; meshes: OcctMesh[] }
type Occt = { ReadStepFile(content: Uint8Array, params: null): OcctResult };

let occtPromise: Promise<Occt> | null = null;
const occt = () => {
  occtPromise ??= (require('occt-import-js') as () => Promise<Occt>)();
  return occtPromise;
};

function meshVolume(mesh: OcctMesh) {
  const p = mesh.attributes.position.array;
  const index = mesh.index.array;
  let volume = 0;
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i] * 3, index[i + 1] * 3, index[i + 2] * 3];
    volume += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
  }
  return volume;
}

describe('Rumpfschale', () => {
  it.each(['coarse', 'standard', 'fine'] as const)('hält die Innenhaut am Heck innerhalb der Außenhaut (%s)', resolution => {
    for (const shape of ['round', 'chine', 'slender'] as const) {
      for (const thickness of [0.0004, 0.0012, 0.002, 0.005]) {
        const hull = hullSpecs({ ...presets[0], hullShape: shape })[0];
        const { stations, m } = shellResolutions[resolution];
        if (!innerSection(hull, thickness / hull.length, thickness, m)) {
          expect(() => hullShell(hull, thickness, resolution)).toThrow(/Wandstärke/);
          continue;
        }
        const skin = outerSkin(hull, stations, m, [thickness / hull.length]);
        const solid = hullShell(hull, thickness, resolution);
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(skin.positions, 3));
        geometry.setIndex(skin.indices);
        const material = new MeshBasicMaterial({ side: DoubleSide });
        const mesh = new Mesh(geometry, material);
        const ray = new Raycaster();
        try {
          const innerBase = skin.positions.length / 3;
          expect(solid.vertices.slice(0, innerBase).flat()).toEqual(skin.positions);
          const samples = [0, 1, 2].flatMap(station =>
            solid.vertices.slice(innerBase + station * (m + 1) + 1, innerBase + station * (m + 1) + m));
          for (const face of solid.faces) {
            if (face.length !== 3 || !face.every(index => index >= innerBase && index < innerBase + 3 * (m + 1))) continue;
            samples.push([0, 1, 2].map(axis => face.reduce((sum, index) => sum + solid.vertices[index][axis], 0) / 3) as [number, number, number]);
          }
          for (const [index, vertex] of samples.entries()) {
            ray.set(new Vector3(vertex[0], hull.yBase - hull.depth, vertex[2]), new Vector3(0, 1, 0));
            const hit = ray.intersectObject(mesh)[0];
            expect(hit).toBeDefined();
            expect(vertex[1] - hit.point.y, `${shape}, ${thickness * 1000} mm, Heckpunkt ${index}`).toBeGreaterThan(0);
          }
        } finally {
          geometry.dispose();
          material.dispose();
        }
      }
    }
  });

  it('erzeugt geschlossene Volumenmodelle für alle Rumpfformen', () => {
    for (const shape of ['round', 'chine', 'slender'] as const) {
      for (const resolution of ['coarse', 'standard', 'fine'] as const) {
        const h = hullSpecs({ ...presets[0], hullShape: shape })[0];
        const solid = hullShell(h, 0.0012, resolution);
        expect(() => validateSolid(solid)).not.toThrow();
        expect(solidVolume(solid)).toBeGreaterThan(0);
      }
    }
  });

  it('entspricht etwa Oberfläche × Wandstärke', () => {
    const h = hullSpecs(presets[0])[0];
    const thin = solidVolume(hullShell(h, 0.001, 'fine'));
    const thick = solidVolume(hullShell(h, 0.002, 'fine'));
    expect(thick / thin).toBeGreaterThan(1.75);
    expect(thick / thin).toBeLessThan(2.25);
    const full = submergedVolume(prepareHull(h), deckY(h, 1) + 1);
    expect(thin).toBeLessThan(full * 0.25);
  });

  it('hält die Wandstärke im Hauptspant ein', () => {
    const h = hullSpecs(presets[0])[0];
    const inner = innerSection(h, 0.5, 0.002, 32)!;
    const { outer } = midshipSection(h, 0.002);
    expect(inner).not.toBeNull();
    const keelGap = inner[16][1] - outer[16][1];
    expect(keelGap).toBeGreaterThan(0.0019);
    expect(keelGap).toBeLessThan(0.0023);
    expect(outer[0][0] - inner[0][0]).toBeGreaterThan(0.0019);
  });

  it('meldet zu große Wandstärken verständlich', () => {
    const tiny = { ...presets[0], length: 0.3, beam: 0.05, hullDepth: 0.02 };
    expect(() => hullShell(hullSpecs(tiny)[0], 0.005)).toThrow(/Wandstärke/);
    expect(() => hullShell(hullSpecs(presets[0])[0], 0.02)).toThrow(/Wandstärke/);
  });

  it('exportiert alle Rümpfe von Mehrrumpfbooten', () => {
    expect(designShells(presets[1], 0.0012, 'coarse', 'all').solids).toHaveLength(2);
    expect(designShells(presets[2], 0.0012, 'coarse', 'all').solids).toHaveLength(3);
    expect(designShells(presets[2], 0.0012, 'coarse', 'main').solids).toHaveLength(1);
  });
});

describe('STEP-Export', () => {
  it('erhaelt individuelle Rumpflaengen im OpenCascade-Wiederimport', async () => {
    for (const design of [{ ...presets[1], length: 1.2, hullLengths: [0.7, 1.2] }, { ...presets[2], length: 1.3, hullLengths: [0.9, 0.65, 1.3] }]) {
      const shells = designShells(design, 0.0012, 'coarse', 'all');
      const text = writeStep(shells.solids, { name: design.name, transform: cadTransform(shells.xStern) });
      const result = (await occt()).ReadStepFile(new TextEncoder().encode(text), null);
      expect(result.success).toBe(true);
      expect(result.meshes).toHaveLength(design.hullLengths.length);
      const lengths = result.meshes.map(mesh => {
        const positions = mesh.attributes.position.array;
        let min = Infinity;
        let max = -Infinity;
        for (let index = 0; index < positions.length; index += 3) { min = Math.min(min, positions[index]); max = Math.max(max, positions[index]); }
        return max - min;
      }).sort((first, second) => first - second);
      const expected = design.hullLengths.map(length => length * 1000).sort((first, second) => first - second);
      lengths.forEach((length, index) => expect(length).toBeCloseTo(expected[index], 1));
    }
  }, 30000);
  it('formatiert Zahlen nach ISO 10303-21', () => {
    expect(stepReal(12)).toBe('12.');
    expect(stepReal(-0.0000001)).toBe('0.');
    expect(stepReal(1.25)).toBe('1.25');
    expect(stepReal(-3.5)).toBe('-3.5');
  });

  it('wird von OpenCascade als geschlossener Volumenkörper gelesen', async () => {
    const d = presets[0];
    const shells = designShells(d, 0.0015, 'coarse', 'all');
    const text = writeStep(shells.solids, { name: 'Aurelia Rumpf', transform: cadTransform(shells.xStern), timestamp: '2025-01-01T00:00:00' });
    expect(text.startsWith('ISO-10303-21;')).toBe(true);
    expect(text).toContain('MANIFOLD_SOLID_BREP');
    expect(text).not.toMatch(/[^\x0a\x20-\x7e]/);
    const result = (await occt()).ReadStepFile(new TextEncoder().encode(text), null);
    expect(result.success).toBe(true);
    expect(result.meshes.length).toBe(1);
    const positions = result.meshes[0].attributes.position.array;
    let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
    }
    expect(minX).toBeCloseTo(0, 1);
    expect(maxX).toBeCloseTo(d.length * 1000, 0);
    expect(maxY - minY).toBeCloseTo(d.beam * 1000, -1);
    expect(Math.abs(meshVolume(result.meshes[0]))).toBeCloseTo(shells.volume * 1e9, -2);
  }, 30000);

  it('exportiert Katamaranrümpfe als getrennte Körper', async () => {
    const shells = designShells(presets[1], 0.0012, 'coarse', 'all');
    const text = writeStep(shells.solids, { name: 'Nomad', transform: cadTransform(shells.xStern) });
    const result = (await occt()).ReadStepFile(new TextEncoder().encode(text), null);
    expect(result.success).toBe(true);
    expect(result.meshes.length).toBe(2);
  }, 30000);
});
