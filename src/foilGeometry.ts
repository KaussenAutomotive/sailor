import * as THREE from 'three';
import { FoilDesign, foilChordFactor, foilIndicators } from './foils';

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

export function buildFoils(length: number, attachmentZ: number, f: FoilDesign, wireframe: boolean) {
  const group = new THREE.Group();
  group.name = 'hydrofoils';
  if (!f.enabled) return group;
  const x = length * (0.5 - f.position / 100);
  const info = foilIndicators(f);
  for (const sign of [-1, 1]) {
    const bottomZ = sign * (attachmentZ - (f.type === 'V' ? Math.min(attachmentZ * 0.6, f.immersion * Math.tan(f.cant * Math.PI / 180)) : 0));
    const start = new THREE.Vector3(x, 0.32, sign * attachmentZ);
    const end = new THREE.Vector3(x, -f.immersion, bottomZ);
    const strutMaterial = new THREE.MeshStandardMaterial({ color: '#324650', metalness: 0.65, roughness: 0.3, wireframe });
    const direction = end.clone().sub(start);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(f.chord * 0.68, direction.length(), 0.07), strutMaterial);
    strut.position.copy(start.clone().add(end).multiplyScalar(0.5));
    strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    group.add(strut);
    const wing = new THREE.Mesh(wingGeometry(f), new THREE.MeshStandardMaterial({
      color: '#6fd9c8', metalness: 0.35, roughness: 0.28, wireframe, side: THREE.DoubleSide,
    }));
    wing.name = 'foil-wing';
    wing.position.copy(end);
    if (f.type !== 'T') wing.scale.z = -sign;
    group.add(wing);
    if (f.visualize && Math.abs(info.lift) > 0.01) {
      const positive = info.lift > 0;
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, positive ? 1 : -1, 0), end.clone().add(new THREE.Vector3(0, 0.12, 0)),
        0.45 + Math.min(2.4, Math.abs(info.fraction) * 1.8), positive ? '#72ead0' : '#f2997f', 0.24, 0.14,
      );
      group.add(arrow);
    }
    if (f.visualize && f.speed > 0) {
      for (const offset of [-0.13, 0, 0.13]) {
        const points = Array.from({ length: 18 }, (_, i) => new THREE.Vector3(
          x - i / 17 * f.speed * 0.13, -f.immersion + Math.sin(i / 17 * Math.PI) * 0.07, bottomZ + offset,
        ));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: '#6ccabb', transparent: true, opacity: 0.28 })));
      }
    }
  }
  return group;
}
