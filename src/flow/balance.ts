import { Design, massCenterDefaults } from '../design';
import { FoilInstance, foilChordFactor, foilSystemIndicators } from '../foils';
import { individualizeFoils, foilPlacementWarnings, placedFoilMount } from '../foilGeometry';
import { displacementMoments, equilibrium } from '../hullGeometry';
import { gravity, waterProperties } from './water';

export type BalanceStatus = 'balanced' | 'unbalanced' | 'unstable' | 'outside-model';

function liftCenter(design: Design, foil: FoilInstance, restLevel: number) {
  const mount = placedFoilMount(design, foil);
  const center = { x: 0, y: 0, z: 0 };
  let area = 0;
  const yaw = foil.yaw * Math.PI / 180;
  const alpha = foil.incidence * Math.PI / 180;
  const cant = foil.cant * Math.PI / 180;
  const mirror = foil.mirrored && foil.type !== 'T' ? -1 : 1;
  for (let index = 0; index < 40; index++) {
    const fraction = (index + 0.5) / 40;
    const chord = foil.chord * foilChordFactor(foil, fraction);
    const span = foil.span * (foil.type === 'T' ? fraction - 0.5 : fraction);
    const localX = chord / 4 * Math.cos(alpha) - Math.abs(span) * Math.tan(foil.sweep * Math.PI / 180);
    const localZ = span * Math.cos(cant) * mirror;
    center.x += chord * (mount.x + localX * Math.cos(yaw) + localZ * Math.sin(yaw));
    center.y += chord * (restLevel - foil.immersion + chord / 4 * Math.sin(alpha) * Math.cos(cant) + Math.abs(span) * Math.sin(cant));
    center.z += chord * (mount.bottomZ - localX * Math.sin(yaw) + localZ * Math.cos(yaw));
    area += chord;
  }
  return { x: center.x / area, y: center.y / area, z: center.z / area };
}

export function analyzeBalance(design: Design, speed = design.flow.speed, checkCollisions = true) {
  const water = waterProperties(design.flow.water);
  const hydro = equilibrium(design, speed);
  const displacement = displacementMoments(hydro.prepared, hydro.level);
  const center = design.massCenter ?? massCenterDefaults;
  const configuration = { ...design.foils, items: individualizeFoils(design) };
  const system = foilSystemIndicators(configuration, { speed, mass: design.mass, ...water });
  const foils = system.foils.map(foil => ({ ...foil, center: liftCenter(design, foil.item, hydro.restLevel) }));
  const buoyancy = water.rho * gravity * displacement.volume;
  const weight = design.mass * gravity;
  const verticalResidual = buoyancy + system.lift - weight;
  const pitchMoment = buoyancy * (displacement.center.x - center.x) + foils.reduce((sum, foil) => sum + foil.lift * (foil.center.x - center.x), 0);
  const rollMoment = -buoyancy * (displacement.center.z - center.z) - foils.reduce((sum, foil) => sum + foil.lift * (foil.center.z - center.z), 0);
  const verticalLever = buoyancy * (displacement.center.y - center.y) + foils.reduce((sum, foil) => sum + foil.lift * (foil.center.y - center.y), 0);
  const pitchStiffness = water.rho * gravity * displacement.pitchInertia + verticalLever;
  const rollStiffness = water.rho * gravity * displacement.rollInertia + verticalLever;
  const forceTolerance = Math.max(0.01, weight * 0.01);
  const momentTolerance = Math.max(0.0001, weight * design.length * 0.001);
  const warnings: string[] = [];
  let outsideModel = hydro.overloaded || hydro.flying;
  if (hydro.overloaded) warnings.push('Rumpfvolumen reicht nicht aus: keine schwimmende Gleichgewichtslage.');
  if (hydro.flying) warnings.push('Foil-Auftrieb erreicht oder ueberschreitet das Gewicht: theoretischer Foil-Flugbereich. Fluglage und Stabilitaet werden nicht berechnet; fuer die schwimmende Bilanz Tempo, Foil-Flaeche oder Anstellwinkel reduzieren.');
  const froude = !hydro.flying && hydro.main.lwl > 0 ? speed / Math.sqrt(gravity * hydro.main.lwl) : null;
  if (froude !== null && froude > 0.6) {
    outsideModel = true;
    warnings.push('Froude-Zahl > 0,6: dynamischer Rumpfauftrieb und Trimm sind in dieser statischen Verdrangerpruefung nicht enthalten.');
  }
  for (const [index, foil] of foils.entries()) {
    if (!design.foils.enabled || !foil.item.enabled || speed === 0) continue;
    const upperReach = foil.item.span * (foil.item.type === 'T' ? 0.5 : 1) * Math.sin(foil.item.cant * Math.PI / 180) + foil.item.chord * (Math.abs(Math.sin(foil.item.incidence * Math.PI / 180)) + foil.item.thickness / 100) / 2;
    if (hydro.restLevel - foil.item.immersion + upperReach >= hydro.level) {
      outsideModel = true;
      warnings.push(`Foil ${index + 1}: Oberflaechenkontakt moeglich, Volltauch-Auftrieb nicht bestaetigt.`);
    }
    if (Math.abs(foil.item.yaw) > 20 || Math.abs(foil.cl) > 1 || Math.abs(foil.item.incidence) > 10) {
      outsideModel = true;
      warnings.push(`Foil ${index + 1}: lineare Profiltheorie ausserhalb des konservativen Pruefbereichs; Stall/Queranstroemung nicht aufgeloest.`);
    }
    if (foil.re < 1e5) warnings.push(`Foil ${index + 1}: Re < 100000, Auftrieb und Profilwiderstand ohne gemessene Polare unsicher.`);
  }
  if (checkCollisions) {
    const collisions = foilPlacementWarnings(design);
    if (collisions.length) { outsideModel = true; warnings.push(...collisions); }
  }
  const stabilityEvaluable = !outsideModel && displacement.volume > 0 && displacement.waterplaneArea > 0;
  const status: BalanceStatus = outsideModel || !stabilityEvaluable ? 'outside-model' : rollStiffness <= 0 || pitchStiffness <= 0 ? 'unstable'
    : Math.abs(verticalResidual) > forceTolerance || Math.abs(pitchMoment) > momentTolerance || Math.abs(rollMoment) > momentTolerance ? 'unbalanced' : 'balanced';
  if (stabilityEvaluable && (rollStiffness <= 0 || pitchStiffness <= 0)) warnings.push('Negative/fehlende anfaengliche Rueckstellsteifigkeit bei konstantem vertikalem Foil-Auftrieb.');
  return { speed, status, hydro, center, buoyancyCenter: displacement.center, buoyancy, foilLift: system.lift, foilDrag: system.drag,
    weight, verticalResidual, pitchMoment, rollMoment, froude, stabilityEvaluable,
    pitchStiffness: stabilityEvaluable ? pitchStiffness : null,
    rollStiffness: stabilityEvaluable ? rollStiffness : null,
    forceTolerance, momentTolerance, foils, warnings };
}

export function balanceCurve(design: Design, maxSpeed = 5, samples = 21) {
  const collisions = foilPlacementWarnings(design);
  return Array.from({ length: samples }, (_, index) => {
    const result = analyzeBalance(design, maxSpeed * index / (samples - 1), false);
    return { speed: result.speed, buoyancy: result.buoyancy, foilLift: result.foilLift, weight: result.weight,
      pitchMoment: result.pitchMoment, rollMoment: result.rollMoment, verticalResidual: result.verticalResidual,
      status: collisions.length && design.foils.enabled ? 'outside-model' as const : result.status };
  });
}