import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { foilDefaults, foilIndicators, foilLimits, foilPreviewHeight, parseFoils } from './foils';
import { buildFoils, wingGeometry } from './foilGeometry';
import { parseDesign, presets } from './design';

const enabled = { ...foilDefaults, enabled: true };

describe('Hydrofoil persistence and validation', () => {
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
  it('produces no forces or preview lift when disabled or stationary', () => {
    for (const f of [foilDefaults, { ...enabled, speed: 0 }]) {
      expect(foilIndicators(f).lift).toBe(0);
      expect(foilIndicators(f).drag).toBe(0);
      expect(foilPreviewHeight(f)).toBe(0);
    }
  });
  it('matches the specified lift and drag equations in SI units', () => {
    const f = { ...enabled, planform: 'straight' as const, span: 2, chord: 0.4, cant: 0, speed: 20, incidence: 5 };
    const area = 1.6;
    const ar = 5;
    const cl = 2 * Math.PI * (5 * Math.PI / 180) * ar / (ar + 2);
    const q = 0.5 * 1025 * (20 * 0.514444) ** 2;
    expect(foilIndicators(f).lift).toBeCloseTo(q * area * cl);
    expect(foilIndicators(f).drag).toBeCloseTo(q * area * (0.015 + cl ** 2 / (Math.PI * 0.8 * ar)));
  });
  it('scales forces quadratically with speed and load share inversely with mass', () => {
    const a = foilIndicators({ ...enabled, speed: 10 });
    const b = foilIndicators({ ...enabled, speed: 20 });
    expect(b.lift).toBeCloseTo(a.lift * 4);
    expect(b.drag).toBeCloseTo(a.drag * 4);
    const heavier = foilIndicators({ ...enabled, mass: enabled.mass * 2 });
    expect(heavier.lift).toBeCloseTo(foilIndicators(enabled).lift);
    expect(heavier.fraction).toBeCloseTo(foilIndicators(enabled).fraction / 2);
  });
  it('calculates the exact theoretical lift-equals-weight reference', () => {
    const info = foilIndicators(enabled);
    expect(info.referenceSpeed).not.toBeNull();
    expect(foilIndicators({ ...enabled, speed: info.referenceSpeed! }).fraction).toBeCloseTo(1);
  });
  it('retains negative lift and avoids claiming a takeoff reference for zero or negative angles', () => {
    expect(foilIndicators({ ...enabled, incidence: -2 }).lift).toBeLessThan(0);
    for (const incidence of [-2, 0]) {
      expect(foilIndicators({ ...enabled, incidence }).referenceSpeed).toBeNull();
      expect(foilPreviewHeight({ ...enabled, incidence })).toBe(0);
    }
  });
  it('uses the edited planform area and cant angle rather than a constant area', () => {
    expect(foilIndicators({ ...enabled, planform: 'straight' }).area).toBeCloseTo(2 * enabled.span * enabled.chord);
    expect(foilIndicators({ ...enabled, planform: 'tapered', taper: 50 }).area).toBeCloseTo(2 * enabled.span * enabled.chord * 0.75);
    expect(foilIndicators({ ...enabled, planform: 'elliptic' }).area).toBeCloseTo(2 * enabled.span * enabled.chord * Math.PI / 4);
    const flat = foilIndicators({ ...enabled, cant: 0 });
    expect(foilIndicators({ ...enabled, cant: 40 }).lift).toBeCloseTo(flat.lift * Math.cos(40 * Math.PI / 180));
  });
  it('only lifts the illustration when explicitly enabled and caps its symbolic height', () => {
    expect(foilPreviewHeight({ ...enabled, visualize: false })).toBe(0);
    expect(foilPreviewHeight({ ...enabled, speed: 35, mass: 0.5 })).toBeCloseTo(enabled.immersion * 0.65);
  });
});

describe('Editable foil meshes', () => {
  it('builds two wings of each type and supports disabling the entire assembly', () => {
    expect(buildFoils(12, 2, foilDefaults, false).children).toHaveLength(0);
    for (const type of ['T', 'L', 'V'] as const) {
      const group = buildFoils(12, 2, { ...enabled, type }, false);
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
        const expected = foilIndicators(f).area / 2;
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
