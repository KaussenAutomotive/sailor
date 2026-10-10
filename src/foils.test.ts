import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { foilDefaults, foilIndicators, foilLimits, foilSystemIndicators, parseFoils } from './foils';
import { buildFoils, foilPlacementWarnings, individualizeFoils, placedFoilMount, wingGeometry } from './foilGeometry';
import { parseDesign, presets } from './design';
import { sectionDrag, waterProperties } from './flow/water';

const enabled = { ...foilDefaults, enabled: true };
const conditions = { speed: 1, mass: 4, ...waterProperties('fresh') };

describe('Hydrofoil persistence and validation', () => {
  it('validiert Einzelpositionen, eindeutige IDs und die Grenze je Rumpf', () => {
    const first = { ...enabled, id: 'one', hull: 0, lateral: 0.1, yaw: 0, mirrored: false };
    for (const patch of [{ lateral: NaN }, { lateral: 2 }, { yaw: 181 }, { hull: -1 }, { hull: 1.5 }, { id: '' }, { mirrored: 'yes' }]) {
      expect(() => parseFoils({ ...enabled, items: [{ ...first, ...patch }] })).toThrow();
    }
    expect(() => parseFoils({ ...enabled, items: [first, first] })).toThrow();
    expect(() => parseFoils({ ...enabled, items: [{ ...first, items: [] }] })).toThrow();
    const items = Array.from({ length: 18 }, (_, index) => ({ ...first, id: `foil-${index}`, hull: Math.floor(index / 6) }));
    expect(parseFoils({ ...enabled, items }).items).toHaveLength(18);
  });
  it('speichert bis zu sechs frei platzierte Foils pro Rumpf und summiert Einzelkraefte', () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ ...enabled, id: `foil-${index}`, hull: 0, lateral: (index % 2 ? 1 : -1) * 0.1, yaw: 0, mirrored: index % 2 === 0, position: index * 20 }));
    const configuration = { ...enabled, items };
    expect(parseFoils(configuration)).toEqual(configuration);
    const result = foilSystemIndicators(configuration, conditions);
    expect(result.foils).toHaveLength(6);
    expect(result.lift).toBeCloseTo(foilIndicators(enabled, conditions).lift * 3);
    expect(result.drag).toBeCloseTo(foilIndicators(enabled, conditions).drag * 3);
    expect(() => parseFoils({ ...configuration, items: [...items, { ...items[0], id: 'seventh' }] })).toThrow(/6 Foils/);
    expect(foilSystemIndicators({ ...configuration, enabled: false }, conditions).lift).toBe(0);
    expect(foilSystemIndicators({ ...configuration, items: [] }, conditions).drag).toBe(0);
  });
  it('migrates old version-1 files without adding active foils', () => {
    const { foils: _foils, ...oldFile } = presets[0];
    expect(parseDesign(JSON.stringify(oldFile)).foils).toEqual(foilDefaults);
    expect(parseFoils(undefined)).not.toBe(foilDefaults);
  });
  it('round-trips all foil settings and strips unknown fields', () => {
    expect(parseFoils({ ...enabled, type: 'V', extra: true })).toEqual({ ...enabled, type: 'V' });
    const d = { ...presets[1], foils: { ...enabled, type: 'L' as const, planform: 'elliptic' as const } };
    expect(parseDesign(JSON.stringify(d))).toEqual(d);
  });
  it('validates every numerical limit, booleans and form', () => {
    for (const [key, [min, max]] of Object.entries(foilLimits)) {
      for (const value of [min, max]) expect(() => parseFoils({ ...enabled, [key]: value })).not.toThrow();
      for (const value of [min - 0.01, max + 0.01, '1', NaN, Infinity]) expect(() => parseFoils({ ...enabled, [key]: value })).toThrow();
    }
    for (const invalid of [null, { ...enabled, enabled: 'yes' }, { ...enabled, type: 'C' }, { ...enabled, planform: 'other' }]) {
      expect(() => parseFoils(invalid)).toThrow();
    }
  });
});

describe('Transparent idealized foil model', () => {
  it('produces no forces when disabled or stationary', () => {
    for (const [f, c] of [[foilDefaults, conditions], [enabled, { ...conditions, speed: 0 }]] as const) {
      expect(foilIndicators(f, c).lift).toBe(0);
      expect(foilIndicators(f, c).drag).toBe(0);
    }
  });
  it('matches the specified lift and drag equations in SI units', () => {
    const f = { ...enabled, planform: 'straight' as const, span: 0.2, chord: 0.04, cant: 0, incidence: 5 };
    const area = 0.016;
    const ar = 5;
    const cl = 2 * Math.PI * (5 * Math.PI / 180) * ar / (ar + 2);
    const q = 0.5 * conditions.rho * conditions.speed ** 2;
    const cd0 = sectionDrag(conditions.speed * f.chord / conditions.nu, f.thickness / 100);
    expect(foilIndicators(f, conditions).lift).toBeCloseTo(q * area * cl);
    expect(foilIndicators(f, conditions).drag).toBeCloseTo(q * area * (cd0 + cl ** 2 / (Math.PI * 0.8 * ar)));
  });
  it('scales forces quadratically with speed and load share inversely with mass', () => {
    const a = foilIndicators(enabled, conditions);
    const b = foilIndicators(enabled, { ...conditions, speed: 2 });
    expect(b.lift).toBeCloseTo(a.lift * 4);
    expect(b.drag).toBeGreaterThan(a.drag);
    const heavier = foilIndicators(enabled, { ...conditions, mass: conditions.mass * 2 });
    expect(heavier.lift).toBeCloseTo(a.lift);
    expect(heavier.fraction).toBeCloseTo(a.fraction / 2);
  });
  it('calculates the exact theoretical lift-equals-weight reference', () => {
    const info = foilIndicators(enabled, conditions);
    expect(info.referenceSpeed).not.toBeNull();
    expect(foilIndicators(enabled, { ...conditions, speed: info.referenceSpeed! }).fraction).toBeCloseTo(1);
  });
  it('retains negative lift and avoids claiming a takeoff reference for zero or negative angles', () => {
    expect(foilIndicators({ ...enabled, incidence: -2 }, conditions).lift).toBeLessThan(0);
    for (const incidence of [-2, 0]) {
      expect(foilIndicators({ ...enabled, incidence }, conditions).referenceSpeed).toBeNull();
    }
  });
  it('uses the edited planform area and cant angle rather than a constant area', () => {
    expect(foilIndicators({ ...enabled, planform: 'straight' }, conditions).area).toBeCloseTo(2 * enabled.span * enabled.chord);
    expect(foilIndicators({ ...enabled, planform: 'tapered', taper: 50 }, conditions).area).toBeCloseTo(2 * enabled.span * enabled.chord * 0.75);
    expect(foilIndicators({ ...enabled, planform: 'elliptic' }, conditions).area).toBeCloseTo(2 * enabled.span * enabled.chord * Math.PI / 4);
    const flat = foilIndicators({ ...enabled, cant: 0 }, conditions);
    expect(foilIndicators({ ...enabled, cant: 40 }, conditions).lift).toBeCloseTo(flat.lift * Math.cos(40 * Math.PI / 180));
  });
});

describe('Editable foil meshes', () => {
  it('warnt bei überlappenden Foils, aber nicht bei getrennten Flügeln', () => {
    const first = { ...enabled, id: 'one', hull: 0, lateral: -0.3, yaw: 0, mirrored: false };
    const design = { ...presets[0], foils: { ...enabled, items: [first, { ...first, id: 'two' }] } };
    expect(foilPlacementWarnings(design)).toHaveLength(1);
    expect(foilPlacementWarnings({ ...design, foils: { ...design.foils, items: [first, { ...first, id: 'two', lateral: 0.3 }] } })).toEqual([]);
  });
  it('rendert sechs unabhängige Foils an den gewählten Positionen und Drehwinkeln', () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ ...enabled, id: `foil-${index}`, hull: 0, lateral: index * 0.02 - 0.05, yaw: index * 5, mirrored: index % 2 === 0, position: index * 20, immersion: 0.05 + index * 0.01 }));
    const design = { ...presets[0], foils: { ...enabled, items } };
    const group = buildFoils(design, 0.08, 1, false);
    const wings = group.children.filter(child => child.name === 'foil-wing');
    expect(wings).toHaveLength(6);
    wings.forEach((wing, index) => {
      expect(wing.position.x).toBeCloseTo(design.length * (0.5 - items[index].position / 100));
      expect(wing.position.z).toBeCloseTo(items[index].lateral);
      expect(wing.position.y).toBeCloseTo(0.08 - items[index].immersion);
      expect(wing.rotation.y).toBeCloseTo(items[index].yaw * Math.PI / 180);
    });
    expect(buildFoils({ ...design, foils: { ...design.foils, items: items.map(item => ({ ...item, enabled: false })) } }, 0.08, 1, false).children).toHaveLength(0);
  });
  it('ordnet freie Foils den richtigen Rümpfen zu und erhält das alte Paar', () => {
    for (const design of presets) {
      const items = individualizeFoils({ ...design, foils: enabled });
      expect(items).toHaveLength(2);
      const converted = { ...design, foils: { ...enabled, items } };
      expect(parseDesign(JSON.stringify(converted))).toEqual(converted);
      expect(foilSystemIndicators(converted.foils, conditions).lift).toBeCloseTo(foilIndicators(enabled, conditions).lift);
      expect(items.every(item => Number.isFinite(placedFoilMount(converted, item).bottomZ))).toBe(true);
    }
    expect(() => parseDesign(JSON.stringify({ ...presets[0], foils: { ...enabled, items: [{ ...individualizeFoils(presets[0])[0], hull: 1 }] } }))).toThrow(/Rumpf/);
  });
  it('builds two wings of each type and supports disabling the entire assembly', () => {
    expect(buildFoils(presets[0], 0, 1, false).children).toHaveLength(0);
    for (const type of ['T', 'L', 'V'] as const) {
      const group = buildFoils({ ...presets[0], foils: { ...enabled, type } }, 0, 1, false);
      expect(group.children.filter(child => child.name === 'foil-wing')).toHaveLength(2);
      const bounds = new THREE.Box3().setFromObject(group);
      expect([bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite)).toBe(true);
    }
  });
  it('tessellates the specified analytic wing area within 0.4 percent', () => {
    for (const type of ['T', 'L', 'V'] as const) {
      for (const planform of ['straight', 'tapered', 'elliptic'] as const) {
        const f = { ...enabled, type, planform, incidence: 0, cant: 0 };
        const geometry = wingGeometry(f);
        const p = geometry.getAttribute('position');
        const index = geometry.getIndex()!;
        const surfaceSize = p.count / 2;
        let area = 0;
        for (let i = 0; i < index.count; i += 3) {
          const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
          if (a >= surfaceSize || b >= surfaceSize || c >= surfaceSize) continue;
          area += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) -
            (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) / 2;
        }
        const expected = foilIndicators(f, conditions).area / 2;
        expect(Math.abs(area - expected) / expected).toBeLessThan(0.004);
        geometry.dispose();
      }
    }
  });
  it('updates geometric extents for thickness, sweep and cant edits', () => {
    const flat = wingGeometry({ ...enabled, planform: 'straight', sweep: 0, cant: 0, incidence: 0 });
    const edited = wingGeometry({ ...enabled, planform: 'straight', thickness: 18, sweep: 35, cant: 40, incidence: 0 });
    flat.computeBoundingBox();
    edited.computeBoundingBox();
    expect(edited.boundingBox!.getSize(new THREE.Vector3()).y).toBeGreaterThan(flat.boundingBox!.getSize(new THREE.Vector3()).y);
    expect(edited.boundingBox!.min.x).toBeLessThan(flat.boundingBox!.min.x);
    flat.dispose();
    edited.dispose();
  });
});
