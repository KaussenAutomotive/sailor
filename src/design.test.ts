import { describe, expect, it } from 'vitest';
import { hullLayout, indicators, limits, massCenterLimits, mastX, parseDesign, parseDesignFile, presets, sailDimensions, setHullLength, setHullType } from './design';

describe('Sailor design files', () => {
  it('begrenzt die gesamte Schiffsmasse auf 10 kg', () => {
    for (const preset of presets) {
      expect(parseDesign(JSON.stringify({ ...preset, mass: 10 })).mass).toBe(10);
      expect(() => parseDesign(JSON.stringify({ ...preset, mass: 10.01 }))).toThrow();
    }
  });
  it('speichert individuelle Laengen und leitet die Gesamtlaenge ab', () => {
    for (const preset of presets.slice(1)) {
      let design = preset;
      hullLayout(preset).forEach((_, index) => { design = setHullLength(design, index, 0.7 + index * 0.2); });
      const lengths = hullLayout(design).map(hull => hull.length);
      expect(lengths).toEqual(design.hullLengths);
      expect(design.length).toBe(Math.max(...lengths));
      expect(parseDesign(JSON.stringify(design))).toEqual(design);
    }
    for (const hullLengths of [[0.5], [1, 2.01], [1, null], [1, '1']]) expect(() => parseDesign(JSON.stringify({ ...presets[1], hullLengths }))).toThrow();
    expect(() => parseDesign(JSON.stringify({ ...presets[1], hullLengths: [0.5, 0.7] }))).toThrow(/Gesamtlaenge/);
    expect(() => setHullLength(presets[1], 2, 1)).toThrow();
    expect(() => setHullLength(presets[1], 0, 2.01)).toThrow();
    expect(parseDesign(JSON.stringify(setHullLength({ ...presets[2], length: 0.3 }, 0, 0.4))).hullLengths).toEqual([0.4, 0.3, 0.3]);
  });
  it('bezieht das Rigg auf den Hauptrumpf und erhaelt passende Laengen beim Konzeptwechsel', () => {
    const cat = { ...presets[1], length: 1.5, hullLengths: [1.5, 0.7] };
    expect(mastX(cat)).toBeCloseTo(0.7 * (0.5 - cat.mastPosition / 100));
    expect(indicators(cat).slenderness).toBeCloseTo(0.7 / hullLayout(cat)[1].width);
    const tri = setHullType(cat, 'tri');
    expect(tri.hullLengths?.[0]).toBe(0.7);
    expect(tri.hullLengths?.[1]).toBe(1.5);
    expect(parseDesign(JSON.stringify(tri))).toEqual(tri);
    const mono = setHullType(tri, 'mono');
    expect(mono.length).toBe(0.7);
    expect(mono.hullLengths).toBeUndefined();
    expect(parseDesign(JSON.stringify(mono))).toEqual(mono);
  });
  it('speichert den Schwerpunkt und prueft alle Koordinatengrenzen', () => {
    const design = { ...presets[0], massCenter: { x: -0.035, y: -0.09, z: 0.012 } };
    expect(parseDesign(JSON.stringify(design))).toEqual(design);
    expect(parseDesign(JSON.stringify(presets[0]))).not.toHaveProperty('massCenter');
    for (const key of ['x', 'y', 'z'] as const) {
      const [min, max] = massCenterLimits[key];
      for (const value of [min, max]) expect(() => parseDesign(JSON.stringify({ ...design, massCenter: { ...design.massCenter, [key]: value } }))).not.toThrow();
      for (const value of [min - 0.01, max + 0.01, null, '0']) expect(() => parseDesign(JSON.stringify({ ...design, massCenter: { ...design.massCenter, [key]: value } }))).toThrow();
    }
    expect(() => parseDesign(JSON.stringify({ ...design, massCenter: [] }))).toThrow();
  });
  it('round-trips each hull concept without losing parameters', () => {
    for (const preset of presets) expect(parseDesign(JSON.stringify(preset))).toEqual(preset);
  });
  it('rejects invalid JSON, unsupported versions and invalid enums', () => {
    for (const text of ['{', 'null', '[]', JSON.stringify({ ...presets[0], version: 3 }), JSON.stringify({ ...presets[0], type: 'motor' })]) {
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
  it('migrates real version-1 yachts to a complete 1 m model', () => {
    const old = { version: 1, name: 'Legacy yacht', type: 'mono', hullShape: 'round', sailShape: 'classic', hullColor: '#42b8ad', length: 10, beam: 2, draft: 2, mastPosition: 40, mastHeight: 15, mainArea: 40, jibArea: 20, camber: 8 };
    const result = parseDesignFile(JSON.stringify(old));
    expect(result.migrated).toBe(true);
    expect(result.design.length).toBe(1);
    expect(result.design.wallThickness).toBe(0.002);
    expect(result.design.draft).toBeCloseTo(0.2);
    expect(result.design.mainArea).toBeCloseTo(0.4);
    expect(result.design.mass).toBeCloseTo(6);
    expect(result.design.foils.enabled).toBe(false);
    expect(parseDesign(JSON.stringify(result.design))).toEqual(result.design);
    const withFoils = parseDesign(JSON.stringify({ ...old, foils: { enabled: true, visualize: true, type: 'T', planform: 'tapered', span: 1.6, chord: 0.35, taper: 55, sweep: 12, cant: 8, thickness: 10, incidence: 5, immersion: 1.2, position: 45, speed: 6, mass: 4 } }));
    expect(withFoils.foils.span).toBeCloseTo(0.16);
    expect(withFoils.mass).toBeCloseTo(4);
    expect(parseDesign(JSON.stringify(withFoils))).toEqual(withFoils);
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
    const d = { ...presets[0], length: 0.3, mainArea: 1.2, mastHeight: 0.8 };
    expect(indicators(d).overhang).toBe(true);
    expect(indicators(d).area).toBeCloseTo(1.42);
  });
  it('accepts a 2 m model and rejects larger boats', () => {
    expect(parseDesign(JSON.stringify({ ...presets[0], length: 2 })).length).toBe(2);
    expect(() => parseDesign(JSON.stringify({ ...presets[0], length: 2.001 }))).toThrow();
  });
  it('uses the trapezoid centroid for a square-top sail', () => {
    const d = { ...presets[0], sailShape: 'square' as const, jibArea: 0 };
    const s = sailDimensions(d);
    const centroid = (s.foot ** 2 + s.foot * s.top + s.top ** 2) / (3 * (s.foot + s.top));
    expect(indicators(d).center).toBeCloseTo(mastX(d) - centroid);
  });
});
