import * as THREE from 'three';
import { Design } from './design';
import { FoilDesign, foilChordFactor, foilIndicators } from './foils';
import { deckY, halfWidth, hullSpecs } from './hullGeometry';
import { waterProperties } from './flow/water';

export function wingGeometry(f: FoilDesign): THREE.BufferGeometry {
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

export interface FoilMount { x: number; z: number; top: number; bottomZ: number; sign: number }

// Strut attachment points in the boat frame: deck edge for monohulls, outer hulls for multihulls.
export function foilMounts(d: Design, wingY: number): FoilMount[] {
  const f = d.foils;
  const specs = hullSpecs(d);
  const x = d.length * (0.5 - f.position / 100);
  const outer = specs.filter(h => h.z !== 0);
  const sides = outer.length ? outer.map(h => ({ spec: h, sign: Math.sign(h.z) })) : [-1, 1].map(sign => ({ spec: specs[0], sign }));
  return sides.map(({ spec, sign }) => {
    const t = Math.min(0.98, Math.max(0.02, x / spec.length + 0.5));
    const z = outer.length ? spec.z : sign * (halfWidth(spec, t) + 0.004 * d.length);
    const top = deckY(spec, t);
    const inward = f.type === 'V' ? Math.min(Math.abs(z) * 0.6, (top - wingY) * Math.tan(f.cant * Math.PI / 180)) : 0;
    return { x, z, top, bottomZ: z - sign * inward, sign };
  });
}

export function buildFoils(d: Design, restLevel: number, speed: number, wireframe: boolean) {
  const f = d.foils;
  const group = new THREE.Group();
  group.name = 'hydrofoils';
  if (!f.enabled) return group;
  const L = d.length;
  const water = waterProperties(d.flow.water);
  const info = foilIndicators(f, { speed, mass: d.mass, rho: water.rho, nu: water.nu });
  const wingY = restLevel - f.immersion;
  for (const mount of foilMounts(d, wingY)) {
    const start = new THREE.Vector3(mount.x, mount.top, mount.z);
    const end = new THREE.Vector3(mount.x, wingY, mount.bottomZ);
    const strutMaterial = new THREE.MeshStandardMaterial({ color: '#324650', metalness: 0.65, roughness: 0.3, wireframe });
    const direction = end.clone().sub(start);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(f.chord * 0.68, direction.length(), Math.max(0.002, f.chord * 0.12)), strutMaterial);
    strut.position.copy(start.clone().add(end).multiplyScalar(0.5));
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(strut);
    const wing = new THREE.Mesh(wingGeometry(f), new THREE.MeshStandardMaterial({
      color: '#6fd9c8', emissive: '#266f62', emissiveIntensity: 0.32,
      metalness: 0.35, roughness: 0.28, wireframe, side: THREE.DoubleSide,
    }));
    wing.name = 'foil-wing';
    wing.position.copy(end);
    if (f.type !== 'T') wing.scale.z = -mount.sign;
    group.add(wing);
    if (f.visualize && Math.abs(info.fraction) > 0.005) {
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
    if (f.visualize && speed > 0) {
      for (const offset of [-0.6, 0, 0.6]) {
        const points = Array.from({ length: 18 }, (_, i) => new THREE.Vector3(
          mount.x + f.chord * 1.5 - i / 17 * L * (0.15 + speed * 0.08),
          wingY + Math.sin(i / 17 * Math.PI) * f.chord * (0.5 + Math.max(0, info.cl)),
          mount.bottomZ + offset * f.span * 0.5,
        ));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: '#6ccabb', transparent: true, opacity: 0.32 })));
      }
    }
  }
  return group;
}
