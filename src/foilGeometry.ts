import * as THREE from 'three';
import { Design } from './design';
import { FoilInstance, FoilParameters, foilChordFactor, foilIndicators } from './foils';
import { deckY, equilibrium, halfWidth, hullSpecs } from './hullGeometry';
import { waterProperties } from './flow/water';

export function wingGeometry(f: FoilParameters): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const chordSteps = 24;
  const spanSteps = 48;
  const stride = chordSteps + 1;
  const surfaceSize = (spanSteps + 1) * stride;
  const alpha = f.incidence * Math.PI / 180;
  const cant = f.cant * Math.PI / 180;
  for (const side of [1, -1]) {
    for (let row = 0; row <= spanSteps; row++) {
      const v = row / spanSteps;
      const z = (f.type === 'T' ? v - 0.5 : v) * f.span;
      const chord = f.chord * foilChordFactor(f, v);
      const sweep = Math.abs(z) * Math.tan(f.sweep * Math.PI / 180);
      for (let column = 0; column <= chordSteps; column++) {
        const u = column / chordSteps;
        const thickness = 5 * f.thickness / 100 * chord *
          (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u ** 2 + 0.2843 * u ** 3 - 0.1036 * u ** 4);
        const chordX = (0.5 - u) * chord;
        const y = chordX * Math.sin(alpha) + side * thickness * Math.cos(alpha);
        positions.push(chordX * Math.cos(alpha) - side * thickness * Math.sin(alpha) - sweep,
          y * Math.cos(cant) + Math.abs(z) * Math.sin(cant), z * Math.cos(cant));
        if (row < spanSteps && column < chordSteps) {
          const a = (side === 1 ? 0 : surfaceSize) + row * stride + column;
          if (side === 1) indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1);
          else indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
        }
      }
    }
  }
  for (const row of [0, spanSteps]) {
    for (let column = 0; column < chordSteps; column++) {
      const a = row * stride + column;
      indices.push(a, a + 1, a + surfaceSize, a + 1, a + surfaceSize + 1, a + surfaceSize);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export interface FoilMount { x: number; z: number; top: number; bottomZ: number; sign: number; hull: number }

// Strut attachment points in the boat frame: deck edge for monohulls, outer hulls for multihulls.
export function foilMounts(d: Design, wingY: number): FoilMount[] {
  const f = d.foils;
  const specs = hullSpecs(d);
  const outer = specs.filter(h => h.z !== 0);
  const sides = outer.length ? outer.map(h => ({ spec: h, sign: Math.sign(h.z) })) : [-1, 1].map(sign => ({ spec: specs[0], sign }));
  return sides.map(({ spec, sign }) => {
    const x = spec.length * (0.5 - f.position / 100);
    const t = Math.min(0.98, Math.max(0.02, x / spec.length + 0.5));
    const z = outer.length ? spec.z : sign * (halfWidth(spec, t) + 0.004 * d.length);
    const top = deckY(spec, t);
    const inward = f.type === 'V' ? Math.min(Math.abs(z) * 0.6, (top - wingY) * Math.tan(f.cant * Math.PI / 180)) : 0;
    return { x, z, top, bottomZ: z - sign * inward, sign, hull: specs.indexOf(spec) };
  });
}

export function placedFoilMount(d: Design, foil: FoilInstance): FoilMount {
  const spec = hullSpecs(d)[foil.hull];
  if (!spec) throw new Error('Foil ist einem nicht vorhandenen Rumpf zugeordnet.');
  const t = 1 - foil.position / 100;
  const width = halfWidth(spec, t);
  return {
    x: spec.length * (t - 0.5), top: deckY(spec, t),
    z: spec.z + Math.max(-width, Math.min(width, foil.lateral)),
    bottomZ: spec.z + foil.lateral, sign: foil.mirrored ? 1 : -1, hull: foil.hull,
  };
}

export function individualizeFoils(d: Design): FoilInstance[] {
  if (d.foils.items !== undefined) return d.foils.items.map(item => ({ ...item }));
  const { items: _items, ...parameters } = d.foils;
  const specs = hullSpecs(d);
  const rest = equilibrium({ ...d, foils: { ...d.foils, enabled: false } });
  return foilMounts(d, rest.restLevel - d.foils.immersion).map((mount, index) => ({
    ...parameters, enabled: true, id: `foil-${index + 1}`, hull: mount.hull,
    lateral: mount.bottomZ - specs[mount.hull].z, yaw: 0, mirrored: mount.sign > 0,
  }));
}

export function foilPlacementWarnings(d: Design): string[] {
  if (!d.foils.enabled || d.foils.items === undefined) return [];
  const boxes = d.foils.items.map((item, index) => {
    if (!item.enabled) return null;
    const mount = placedFoilMount(d, item);
    const geometry = wingGeometry(item);
    geometry.computeBoundingBox();
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(mount.x, -item.immersion, mount.bottomZ),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.yaw * Math.PI / 180),
      new THREE.Vector3(1, 1, item.mirrored && item.type !== 'T' ? -1 : 1),
    );
    const box = geometry.boundingBox!.clone().applyMatrix4(transform);
    geometry.dispose();
    return { box, index };
  });
  const warnings: string[] = [];
  boxes.forEach((first, index) => {
    if (!first) return;
    for (const second of boxes.slice(index + 1)) {
      if (second && first.box.intersectsBox(second.box)) warnings.push(`Foil ${first.index + 1} und Foil ${second.index + 1}: moegliche Ueberschneidung der Fluegel (Huellenbox-Pruefung).`);
    }
  });
  return warnings;
}

export function buildFoils(d: Design, restLevel: number, speed: number, wireframe: boolean) {
  const f = d.foils;
  const group = new THREE.Group();
  group.name = 'hydrofoils';
  if (!f.enabled) return group;
  const L = d.length;
  const water = waterProperties(d.flow.water);
  const assemblies = f.items !== undefined
    ? f.items.filter(item => item.enabled).map(item => ({ parameters: item, mount: placedFoilMount(d, item), wingY: restLevel - item.immersion, yaw: item.yaw, id: item.id }))
    : foilMounts(d, restLevel - f.immersion).map(mount => ({ parameters: f, mount, wingY: restLevel - f.immersion, yaw: 0, id: `foil-${mount.sign}` }));
  for (const { parameters, mount, wingY, yaw, id } of assemblies) {
    const info = foilIndicators({ ...parameters, incidence: parameters.incidence * Math.cos(yaw * Math.PI / 180) }, { speed, mass: d.mass, rho: water.rho, nu: water.nu }, 1);
    const start = new THREE.Vector3(mount.x, mount.top, mount.z);
    const end = new THREE.Vector3(mount.x, wingY, mount.bottomZ);
    const strutMaterial = new THREE.MeshStandardMaterial({ color: '#324650', metalness: 0.65, roughness: 0.3, wireframe });
    const direction = end.clone().sub(start);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(parameters.chord * 0.68, direction.length(), Math.max(0.002, parameters.chord * 0.12)), strutMaterial);
    strut.position.copy(start.clone().add(end).multiplyScalar(0.5));
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(strut);
    const wing = new THREE.Mesh(wingGeometry(parameters), new THREE.MeshStandardMaterial({
      color: '#6fd9c8', emissive: '#266f62', emissiveIntensity: 0.32,
      metalness: 0.35, roughness: 0.28, wireframe, side: THREE.DoubleSide,
    }));
    wing.name = 'foil-wing';
    wing.userData.foilId = id;
    wing.userData.hull = mount.hull;
    wing.position.copy(end);
    wing.rotation.y = yaw * Math.PI / 180;
    if (parameters.type !== 'T') wing.scale.z = -mount.sign;
    group.add(wing);
    if (f.visualize && parameters.visualize && Math.abs(info.fraction) > 0.005) {
      const positive = info.lift > 0;
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, positive ? 1 : -1, 0), end.clone().add(new THREE.Vector3(0, 0.03 * L, 0)),
        L * (0.12 + Math.min(0.6, Math.abs(info.fraction) * 0.45)), positive ? '#72ead0' : '#f2997f', 0.06 * L, 0.035 * L,
      );
      for (const part of [arrow.line, arrow.cone]) {
        const materials = Array.isArray(part.material) ? part.material : [part.material];
        materials.forEach(material => { material.depthTest = false; });
        part.renderOrder = 2;
      }
      group.add(arrow);
    }
    if (f.visualize && parameters.visualize && speed > 0) {
      for (const offset of [-0.6, 0, 0.6]) {
        const points = Array.from({ length: 18 }, (_, i) => new THREE.Vector3(
          mount.x + parameters.chord * 1.5 - i / 17 * L * (0.15 + speed * 0.08),
          wingY + Math.sin(i / 17 * Math.PI) * parameters.chord * (0.5 + Math.max(0, info.cl)),
          mount.bottomZ + offset * parameters.span * 0.5,
        ));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: '#6ccabb', transparent: true, opacity: 0.32 })));
      }
    }
  }
  return group;
}
