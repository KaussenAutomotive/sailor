// Two-dimensional Hess–Smith panel method: constant-strength sources per panel plus one
// uniform vortex strength with a Kutta condition. Inviscid, incompressible, steady.

export type Vec2 = [number, number];

export interface PanelSolution {
  nodes: Vec2[];
  control: Vec2[];
  cp: number[];
  vt: number[];
  sources: number[];
  gamma: number;
  cl: number;
  chord: number;
  alpha: number;
  velocity(x: number, y: number): Vec2;
  inside(x: number, y: number): boolean;
}

// Symmetric NACA 4-digit section with a closed trailing edge, ordered clockwise:
// trailing edge → lower surface → leading edge → upper surface → trailing edge.
export function nacaSymmetric(thickness: number, panels = 120): Vec2[] {
  const half = panels / 2;
  const yt = (x: number) => 5 * thickness * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const points: Vec2[] = [];
  for (let i = 0; i <= half; i++) {
    const x = 0.5 * (1 + Math.cos(Math.PI * i / half));
    points.push([x, -yt(x)]);
  }
  for (let i = half - 1; i >= 0; i--) {
    const x = 0.5 * (1 + Math.cos(Math.PI * i / half));
    points.push([x, yt(x)]);
  }
  points[0] = [1, 0];
  points[points.length - 1] = [1, 0];
  return points;
}

export function circle(panels = 64): Vec2[] {
  return Array.from({ length: panels + 1 }, (_, i) => {
    const a = -2 * Math.PI * i / panels;
    return [Math.cos(a), Math.sin(a)] as Vec2;
  });
}

function solveLinear(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const p = a[col][col];
    if (Math.abs(p) < 1e-14) throw new Error('Panelgleichungssystem ist singulär.');
    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / p;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = a[r][n];
    for (let c = r + 1; c < n; c++) s -= a[r][c] * x[c];
    x[r] = s / a[r][r];
  }
  return x;
}

// Velocity induced at (x, y) by unit-strength source and vortex distributions on panel j,
// expressed along the direction with angle `theta` (tangential) and its left normal.
function influence(x: number, y: number, a: Vec2, b: Vec2, thetaJ: number, theta: number, self: boolean) {
  const r1 = Math.hypot(x - a[0], y - a[1]);
  const r2 = Math.hypot(x - b[0], y - b[1]);
  const beta = self ? Math.PI : Math.atan2(
    (y - b[1]) * (x - a[0]) - (x - b[0]) * (y - a[1]),
    (x - b[0]) * (x - a[0]) + (y - b[1]) * (y - a[1]),
  );
  const log = Math.log(r2 / r1);
  const s = Math.sin(theta - thetaJ);
  const c = Math.cos(theta - thetaJ);
  const k = 1 / (2 * Math.PI);
  return {
    sourceNormal: k * (s * log + c * beta),
    sourceTangent: k * (s * beta - c * log),
    vortexNormal: k * (c * log - s * beta),
    vortexTangent: k * (s * log + c * beta),
  };
}

export function solvePanels(nodes: Vec2[], alphaDegrees: number, options: { kutta?: boolean } = {}): PanelSolution {
  const kutta = options.kutta ?? true;
  const n = nodes.length - 1;
  const alpha = alphaDegrees * Math.PI / 180;
  const theta = Array.from({ length: n }, (_, j) => Math.atan2(nodes[j + 1][1] - nodes[j][1], nodes[j + 1][0] - nodes[j][0]));
  const control = Array.from({ length: n }, (_, j) => [(nodes[j][0] + nodes[j + 1][0]) / 2, (nodes[j][1] + nodes[j + 1][1]) / 2] as Vec2);
  const size = kutta ? n + 1 : n;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(0));
  const rhs = new Array(size).fill(0);
  const tangentSource = Array.from({ length: n }, () => new Array(n).fill(0));
  const tangentVortex = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const f = influence(control[i][0], control[i][1], nodes[j], nodes[j + 1], theta[j], theta[i], i === j);
      matrix[i][j] = f.sourceNormal;
      if (kutta) matrix[i][n] += f.vortexNormal;
      tangentSource[i][j] = f.sourceTangent;
      tangentVortex[i] += f.vortexTangent;
    }
    rhs[i] = -Math.sin(alpha - theta[i]);
  }
  if (kutta) {
    for (let j = 0; j < n; j++) matrix[n][j] = tangentSource[0][j] + tangentSource[n - 1][j];
    matrix[n][n] = tangentVortex[0] + tangentVortex[n - 1];
    rhs[n] = -Math.cos(theta[0] - alpha) - Math.cos(theta[n - 1] - alpha);
  }
  const solution = solveLinear(matrix, rhs);
  const sources = solution.slice(0, n);
  const gamma = kutta ? solution[n] : 0;
  const vt = Array.from({ length: n }, (_, i) => {
    let v = Math.cos(theta[i] - alpha) + gamma * tangentVortex[i];
    for (let j = 0; j < n; j++) v += sources[j] * tangentSource[i][j];
    return v;
  });
  let perimeter = 0;
  for (let j = 0; j < n; j++) perimeter += Math.hypot(nodes[j + 1][0] - nodes[j][0], nodes[j + 1][1] - nodes[j][1]);
  const xs = nodes.map(p => p[0]);
  const chord = Math.max(...xs) - Math.min(...xs);
  const velocity = (x: number, y: number): Vec2 => {
    let u = Math.cos(alpha);
    let v = Math.sin(alpha);
    for (let j = 0; j < n; j++) {
      const f = influence(x, y, nodes[j], nodes[j + 1], theta[j], 0, false);
      u += sources[j] * f.sourceTangent + gamma * f.vortexTangent;
      v += sources[j] * f.sourceNormal + gamma * f.vortexNormal;
    }
    return [u, v];
  };
  const inside = (x: number, y: number) => {
    let hit = false;
    for (let j = 0; j < n; j++) {
      const [a, b] = [nodes[j], nodes[j + 1]];
      if ((a[1] > y) !== (b[1] > y) && x < a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])) hit = !hit;
    }
    return hit;
  };
  return {
    nodes, control, vt, sources, gamma, chord, alpha: alphaDegrees,
    cp: vt.map(v => 1 - v * v),
    cl: 2 * gamma * perimeter / chord,
    velocity, inside,
  };
}

export function streamlines(solution: PanelSolution, options: { seeds?: number; span?: number; step?: number } = {}): Vec2[][] {
  const seeds = options.seeds ?? 15;
  const span = options.span ?? 0.42;
  const step = options.step ?? 0.012;
  const lines: Vec2[][] = [];
  for (let s = 0; s < seeds; s++) {
    let p: Vec2 = [-0.45, -span + 2 * span * (s + 0.5) / seeds];
    const line: Vec2[] = [p];
    for (let k = 0; k < 320; k++) {
      const v1 = solution.velocity(p[0], p[1]);
      const m1 = Math.hypot(v1[0], v1[1]) || 1;
      const mid: Vec2 = [p[0] + v1[0] / m1 * step / 2, p[1] + v1[1] / m1 * step / 2];
      const v2 = solution.velocity(mid[0], mid[1]);
      const m2 = Math.hypot(v2[0], v2[1]) || 1;
      p = [p[0] + v2[0] / m2 * step, p[1] + v2[1] / m2 * step];
      if (solution.inside(p[0], p[1]) || p[0] > 1.5 || Math.abs(p[1]) > 1) break;
      line.push(p);
    }
    lines.push(line);
  }
  return lines;
}
