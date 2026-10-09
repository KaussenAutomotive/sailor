import { describe, expect, it } from 'vitest';
import { MichellHull, michellAmplitude, waveResistance, wavePattern } from './michell';
import { circle, nacaSymmetric, solvePanels, streamlines } from './panel';
import { gravity, ittc57, plateFriction, waterProperties } from './water';
import { analyzeFlow, formFactor, resistanceCurve } from './resistance';
import { presets } from '../design';

function wigley(L: number, B: number, T: number, offset = 0, nx = 80, nz = 16): MichellHull {
  const xs = Array.from({ length: nx + 1 }, (_, i) => -L / 2 + L * i / nx);
  const zs = Array.from({ length: nz + 1 }, (_, j) => -T + T * j / nz);
  return { xs, zs, offset, y: xs.map(x => zs.map(z => (B / 2) * (1 - (2 * x / L) ** 2) * (1 - (z / T) ** 2))) };
}

function wigleyAmplitude(L: number, B: number, T: number, k0: number, lambda: number) {
  const a = lambda * k0;
  const b = lambda * lambda * k0;
  const l = L / 2;
  const xIntegralIm = 2 * (Math.sin(a * l) / a ** 2 - l * Math.cos(a * l) / a);
  const e = Math.exp(-b * T);
  const zIntegral = (1 - e) / b - (1 / T ** 2) * (2 / b ** 3 - e * (T ** 2 / b + 2 * T / b ** 2 + 2 / b ** 3));
  return -(4 * B / L ** 2) * xIntegralIm * zIntegral;
}

describe('Wasser und Reibung', () => {
  it('liefert plausible Stoffwerte und Reibungsbeiwerte', () => {
    expect(waterProperties('salt').rho).toBeGreaterThan(waterProperties('fresh').rho);
    expect(ittc57(1e6)).toBeCloseTo(0.075 / (6 - 2) ** 2, 6);
    expect(plateFriction(1e5)).toBeCloseTo(1.328 / Math.sqrt(1e5), 6);
    expect(plateFriction(1e7)).toBeLessThan(plateFriction(1e6));
  });
});

describe('Michell-Wellenwiderstand', () => {
  it('stimmt mit der geschlossenen Wigley-Lösung überein', () => {
    const [L, B, T] = [1, 0.1, 0.0625];
    const hull = wigley(L, B, T, 0, 160, 40);
    const k0 = gravity / 1.2 ** 2;
    for (const lambda of [1.05, 1.6, 3]) {
      const [re, im] = michellAmplitude(hull, k0, lambda);
      const exact = wigleyAmplitude(L, B, T, k0, lambda);
      expect(Math.abs(re)).toBeLessThan(Math.abs(exact) * 0.02 + 1e-9);
      expect(im).toBeCloseTo(exact, 4);
      expect(Math.abs(im - exact) / Math.abs(exact)).toBeLessThan(0.02);
    }
  });

  it('skaliert mit B² und liefert Cw in plausibler Größenordnung', () => {
    const rho = 1000;
    const L = 1;
    const S = 0.155; // approx. wetted area of the Wigley hull B/L 0.1, T/L 0.0625
    const fn = (f: number) => f * Math.sqrt(gravity * L);
    const r1 = waveResistance([wigley(1, 0.1, 0.0625)], fn(0.35), rho);
    const r2 = waveResistance([wigley(1, 0.2, 0.0625)], fn(0.35), rho);
    expect(r1).toBeGreaterThan(0);
    expect(r2 / r1).toBeCloseTo(4, 2);
    const cw = (f: number) => waveResistance([wigley(1, 0.1, 0.0625)], fn(f), rho) / (0.5 * rho * fn(f) ** 2 * S);
    expect(cw(0.5)).toBeGreaterThan(1e-3);
    expect(cw(0.5)).toBeLessThan(5e-3);
    expect(cw(0.5)).toBeGreaterThan(cw(0.2));
  });

  it('verdoppelt die Amplitude bei zwei deckungsgleichen Rümpfen', () => {
    const one = waveResistance([wigley(1, 0.1, 0.06)], 1.2, 1000);
    const two = waveResistance([wigley(1, 0.1, 0.06), wigley(1, 0.1, 0.06)], 1.2, 1000);
    expect(two / one).toBeCloseTo(4, 2);
    const apart = waveResistance([wigley(1, 0.1, 0.06, -0.3), wigley(1, 0.1, 0.06, 0.3)], 1.2, 1000);
    expect(apart).toBeGreaterThan(one);
  });

  it('erzeugt ein Kelvin-Wellenmuster hinter dem Rumpf', () => {
    const U = 1.2;
    const points = Array.from({ length: 200 }, (_, i) => ({ x: -1 - i * 0.02, y: 0 }));
    const field = wavePattern([wigley(1, 0.1, 0.06)], U, points);
    expect(Math.max(...field)).toBeGreaterThan(0);
    const crossings = [];
    for (let i = 1; i < field.length; i++) if (field[i - 1] < 0 && field[i] >= 0) crossings.push(i);
    const wavelength = (crossings[crossings.length - 1] - crossings[0]) * 0.02 / (crossings.length - 1);
    expect(wavelength).toBeGreaterThan(2 * Math.PI * U * U / gravity * 0.8);
    expect(wavelength).toBeLessThan(2 * Math.PI * U * U / gravity * 1.25);
  });
});

describe('Panelverfahren', () => {
  it('reproduziert die Zylinderumströmung', () => {
    const sol = solvePanels(circle(96), 0, { kutta: false });
    sol.control.forEach((p, i) => {
      const theta = Math.atan2(p[1], p[0]);
      expect(sol.cp[i]).toBeCloseTo(1 - 4 * Math.sin(theta) ** 2, 1);
    });
  });

  it('liefert den Profilauftrieb nach dünner Profiltheorie', () => {
    const t = 0.12;
    const sol = solvePanels(nacaSymmetric(t, 160), 5);
    const theory = 2 * Math.PI * 5 * Math.PI / 180 * (1 + 0.77 * t);
    expect(Math.abs(sol.cl - theory) / theory).toBeLessThan(0.03);
    expect(Math.abs(solvePanels(nacaSymmetric(t, 160), 0).cl)).toBeLessThan(1e-6);
    const lines = streamlines(sol, { seeds: 6 });
    expect(lines.every(line => line.length > 50)).toBe(true);
    const [u, v] = sol.velocity(-3, 0);
    expect(Math.hypot(u, v)).toBeCloseTo(1, 1);
  });
});

describe('Widerstandsanalyse', () => {
  it('liefert konsistente Widerstandsanteile für alle Vorlagen', () => {
    presets.forEach(design => {
      const r = analyzeFlow(design);
      expect(r.total).toBeGreaterThan(0);
      expect(r.total).toBeCloseTo(r.friction + r.form + r.wave + r.appendage + r.induced + r.foil, 8);
      expect(r.hydro.overloaded).toBe(false);
      expect(r.froude).toBeGreaterThan(0.05);
      expect(r.total).toBeLessThan(20);
    });
  });

  it('steigt mit der Geschwindigkeit', () => {
    const curve = resistanceCurve(presets[0], 2.5, 10);
    for (let i = 1; i < curve.length; i++) expect(curve[i].total).toBeGreaterThan(curve[i - 1].total);
    expect(formFactor(0.5, 1, 0.12, 0.05)).toBeGreaterThan(0);
  });

  it('erzeugt Seitenkraft durch Abdrift', () => {
    const d = presets[0];
    const none = analyzeFlow({ ...d, flow: { ...d.flow, leeway: 0 } });
    const some = analyzeFlow({ ...d, flow: { ...d.flow, leeway: 5 } });
    expect(none.sideForce).toBe(0);
    expect(some.sideForce).toBeGreaterThan(0);
    expect(some.induced).toBeGreaterThan(none.induced);
  });
});
