import { PreparedHull, halfBreadthAt, keelY } from '../hullGeometry';
import { gravity } from './water';

// Thin-ship (Michell 1898) wave resistance with exact piecewise-linear (Filon-type) quadrature.
// The source strength is ∂Y/∂x on the centre plane; an immersed transom is treated as dry (no closure term).

type Complex = [number, number];

export interface MichellHull {
  xs: number[];
  zs: number[];
  y: number[][];
  offset: number;
}

// ∫ e^{i a x} dx over [p, q].
function segmentOscillatory(p: number, q: number, a: number): Complex {
  const h = q - p;
  const e = a * h;
  if (Math.abs(e) < 1e-4) {
    const [c, s] = [Math.cos(a * p), Math.sin(a * p)];
    return [h * (c - s * e / 2), h * (s + c * e / 2)];
  }
  return [(Math.sin(a * q) - Math.sin(a * p)) / a, (Math.cos(a * p) - Math.cos(a * q)) / a];
}

// ∫ hat_j(z) e^{b z} dz for piecewise-linear hat functions on the nodes.
export function hatExponential(nodes: number[], b: number): number[] {
  const out = new Array(nodes.length).fill(0);
  for (let j = 0; j < nodes.length - 1; j++) {
    const p = nodes[j];
    const q = nodes[j + 1];
    const h = q - p;
    const e = b * h;
    const ep = Math.exp(b * p);
    let i0: number;
    let i1: number;
    if (Math.abs(e) < 1e-3) {
      i0 = ep * h * (1 / 2 + e / 6 + e * e / 24);
      i1 = ep * h * (1 / 2 + e / 3 + e * e / 8);
    } else {
      const eq = Math.exp(b * q);
      const total = (eq - ep) / b;
      i1 = eq / b - (eq - ep) / (b * b * h);
      i0 = total - i1;
    }
    out[j] += i0;
    out[j + 1] += i1;
  }
  return out;
}

export function michellHull(p: PreparedHull, level: number, nx = 64, nz = 12): MichellHull | null {
  const draft = level - p.bottom;
  if (draft <= 1e-5) return null;
  const xs: number[] = [];
  const y: number[][] = [];
  const zs = Array.from({ length: nz + 1 }, (_, j) => -draft + draft * j / nz);
  for (let i = 0; i <= nx; i++) {
    const t = i / nx;
    xs.push((t - 0.5) * p.spec.length);
    const keel = keelY(p.spec, t);
    y.push(zs.map(z => (t >= 1 || level + z <= keel) ? 0 : halfBreadthAt(p.spec, t, level + z, 32)));
  }
  return { xs, zs, y, offset: p.spec.z };
}

// Kochin-type amplitude A(λ) = ∫∫ ∂Y/∂x · e^{λ² k0 z} · e^{i λ k0 x} dx dz.
export function michellAmplitude(h: MichellHull, k0: number, lambda: number): Complex {
  const a = lambda * k0;
  const zWeights = hatExponential(h.zs, lambda * lambda * k0);
  let re = 0;
  let im = 0;
  for (let i = 0; i < h.xs.length - 1; i++) {
    const dx = h.xs[i + 1] - h.xs[i];
    let slope = 0;
    for (let j = 0; j < h.zs.length; j++) slope += (h.y[i + 1][j] - h.y[i][j]) * zWeights[j];
    if (slope === 0) continue;
    const [er, ei] = segmentOscillatory(h.xs[i], h.xs[i + 1], a);
    re += slope / dx * er;
    im += slope / dx * ei;
  }
  return [re, im];
}

function combined(hulls: MichellHull[], k0: number, lambda: number) {
  const beta = k0 * lambda * Math.sqrt(Math.max(0, lambda * lambda - 1));
  const amps = hulls.map(h => michellAmplitude(h, k0, lambda));
  const sides = [1, -1].map(sign => {
    let re = 0;
    let im = 0;
    hulls.forEach((h, n) => {
      const [c, s] = [Math.cos(sign * beta * h.offset), Math.sin(sign * beta * h.offset)];
      re += amps[n][0] * c - amps[n][1] * s;
      im += amps[n][0] * s + amps[n][1] * c;
    });
    return [re, im] as Complex;
  });
  return { sides, beta };
}

export function waveResistance(hulls: MichellHull[], speed: number, rho: number): number {
  if (!hulls.length || speed <= 0) return 0;
  const k0 = gravity / speed ** 2;
  const xMin = Math.min(...hulls.map(h => h.xs[0]));
  const xMax = Math.max(...hulls.map(h => h.xs[h.xs.length - 1]));
  const length = xMax - xMin;
  const offsets = hulls.map(h => h.offset);
  const spread = Math.max(...offsets) - Math.min(...offsets);
  const draft = Math.max(...hulls.map(h => -h.zs[0]));
  const lambdaMax = Math.min(40, Math.max(4, Math.sqrt(40 / (k0 * draft))));
  const uMax = Math.acosh(lambdaMax);
  const integrand = (u: number) => {
    const lambda = Math.cosh(u);
    const { sides } = combined(hulls, k0, lambda);
    const power = (sides[0][0] ** 2 + sides[0][1] ** 2 + sides[1][0] ** 2 + sides[1][1] ** 2) / 2;
    return power * lambda * lambda;
  };
  let u = 0;
  let previous = integrand(0);
  let sum = 0;
  while (u < uMax) {
    const limitX = Math.PI / (4 * k0 * length * Math.sinh(u) + 1e-12);
    const limitY = spread > 0 ? Math.PI / (4 * k0 * spread * Math.cosh(2 * u)) : Infinity;
    const du = Math.min(0.04, limitX, limitY, uMax - u);
    u += du;
    const value = integrand(u);
    sum += (previous + value) / 2 * du;
    previous = value;
  }
  return 4 * rho * gravity ** 2 / (Math.PI * speed ** 2) * sum;
}

// Linear far-field elevation from the same spectrum. Returned values are relative (normalised later).
// The angular resolution follows the phase variation across the requested domain to avoid aliasing.
export function wavePattern(hulls: MichellHull[], speed: number, points: { x: number; y: number }[], angles?: number): Float32Array {
  const out = new Float32Array(points.length);
  if (!hulls.length || speed <= 0) return out;
  const k0 = gravity / speed ** 2;
  const thetaMax = 1.1;
  const extent = points.reduce((m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.y)), 0);
  angles ??= Math.min(360, Math.max(48, Math.ceil(1.5 * k0 * extent * thetaMax / Math.cos(thetaMax) ** 3)));
  const dTheta = thetaMax / angles;
  const spectrum = Array.from({ length: angles }, (_, n) => {
    const theta = (n + 0.5) * dTheta;
    const lambda = 1 / Math.cos(theta);
    const { sides, beta } = combined(hulls, k0, lambda);
    return { kx: k0 * lambda, ky: beta, weight: lambda ** 3 * dTheta, sides };
  });
  points.forEach((point, index) => {
    let value = 0;
    for (const s of spectrum) {
      for (let side = 0; side < 2; side++) {
        const phase = -s.kx * point.x - (side === 0 ? 1 : -1) * s.ky * point.y;
        const [c, sn] = [Math.cos(phase), Math.sin(phase)];
        value += s.weight * (s.sides[side][0] * c - s.sides[side][1] * sn);
      }
    }
    out[index] = value;
  });
  return out;
}

