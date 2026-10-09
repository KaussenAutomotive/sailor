export const gravity = 9.81;

export interface WaterProperties { rho: number; nu: number; label: string }

// 20 °C reference values: density in kg/m³, kinematic viscosity in m²/s.
export function waterProperties(kind: 'fresh' | 'salt'): WaterProperties {
  return kind === 'salt'
    ? { rho: 1025, nu: 1.05e-6, label: 'Salzwasser' }
    : { rho: 998, nu: 1.004e-6, label: 'Süßwasser' };
}

export function ittc57(re: number) {
  return 0.075 / (Math.log10(Math.max(re, 1e3)) - 2) ** 2;
}

// Flat-plate friction with laminar flow below Re 5·10⁵ and Prandtl–Schlichting transition above.
export function plateFriction(re: number) {
  const r = Math.max(re, 100);
  return r < 5e5 ? 1.328 / Math.sqrt(r) : 0.074 / r ** 0.2 - 1700 / r;
}

// Zero-lift drag coefficient of a symmetric section, referenced to the planform area.
export function sectionDrag(re: number, thicknessRatio: number) {
  return 2 * plateFriction(re) * (1 + 2 * thicknessRatio + 60 * thicknessRatio ** 4);
}
