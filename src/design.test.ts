import { describe, expect, it } from 'vitest';
import { hullLayout, indicators, limits, mastX, parseDesign, presets, sailDimensions } from './design';

describe('Sailor design files', () => {
  it('round-trips each hull concept without losing parameters', () => {
    for (const preset of presets) expect(parseDesign(JSON.stringify(preset))).toEqual(preset);
  });
  it('rejects invalid JSON, unsupported versions and invalid enums', () => {
    for (const text of ['{', 'null', '[]', JSON.stringify({ ...presets[0], version: 2 }), JSON.stringify({ ...presets[0], type: 'motor' })]) {
      expect(() => parseDesign(text)).toThrow();
    }
  });
  it('validates every numeric parameter and its exact boundaries', () => {
    for (const [key, [min, max]] of Object.entries(limits)) {
      for (const value of [min, max]) expect(() => parseDesign(JSON.stringify({ ...presets[0], [key]: value }))).not.toThrow();
      for (const value of [min - 0.1, max + 0.1, null, '12']) expect(() => parseDesign(JSON.stringify({ ...presets[0], [key]: value }))).toThrow();
    }
  });
  it('requires a valid name and color and strips unknown fields', () => {
    expect(() => parseDesign(JSON.stringify({ ...presets[0], name: ' ' }))).toThrow();
    expect(() => parseDesign(JSON.stringify({ ...presets[0], hullColor: 'red' }))).toThrow();
    expect(parseDesign(JSON.stringify({ ...presets[0], extra: 'ignored' }))).not.toHaveProperty('extra');
  });
});

describe('Parametric geometry and indicators', () => {
  it('places the mast at the requested distance from the bow', () => {
    for (const position of [25, 42, 65]) {
      const d = { ...presets[0], mastPosition: position };
      expect((d.length / 2 - mastX(d)) / d.length * 100).toBeCloseTo(position);
    }
  });
  it('preserves the requested planar sail areas for both sail shapes', () => {
    for (const sailShape of ['classic', 'square'] as const) {
      for (const mainArea of [12, 38, 100]) {
        const d = { ...presets[0], sailShape, mainArea };
        const s = sailDimensions(d);
        expect((s.foot + s.top) / 2 * s.height).toBeCloseTo(d.mainArea);
        expect(s.jibHeight * s.jibFoot / 2).toBeCloseTo(d.jibArea);
      }
    }
  });
  it('supports a rig without a jib', () => {
    const d = { ...presets[0], jibArea: 0 };
    expect(sailDimensions(d).jibFoot).toBe(0);
    expect(indicators(d).area).toBe(d.mainArea);
    expect(Number.isFinite(indicators(d).center)).toBe(true);
  });
  it('keeps all hulls within the selected overall beam', () => {
    presets.forEach((d, index) => {
      const hulls = hullLayout(d);
      expect(hulls.length).toBe(index + 1);
      const extent = Math.max(...hulls.map(hull => Math.abs(hull.z) + hull.width / 2));
      expect(extent * 2).toBeCloseTo(d.beam);
      expect(hulls.every(hull => hull.width > 0 && hull.length > 0)).toBe(true);
    });
  });
  it('reports sail overhang rather than silently clamping the sail area', () => {
    const d = { ...presets[0], length: 6, mainArea: 100, mastHeight: 8 };
    expect(indicators(d).overhang).toBe(true);
    expect(indicators(d).area).toBe(126);
  });
  it('uses the documented displacement hull reference formula', () => {
    expect(indicators(presets[0]).hullSpeed).toBeCloseTo(2.43 * Math.sqrt(11.6 * 0.92));
  });
  it('uses the trapezoid centroid for a square-top sail', () => {
    const d = { ...presets[0], sailShape: 'square' as const, jibArea: 0 };
    const s = sailDimensions(d);
    const centroid = (s.foot ** 2 + s.foot * s.top + s.top ** 2) / (3 * (s.foot + s.top));
    expect(indicators(d).center).toBeCloseTo(mastX(d) - centroid);
  });
});
