import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Design, mastX, sailDimensions } from './design';
import { buildFoils } from './foilGeometry';
import { appendages } from './appendages';
import { Equilibrium, HullSpec, deckY, equilibrium, halfWidth, hullSpecs, outerSkin, sectionPoints, stationX } from './hullGeometry';
import { MichellHull, michellHull, wavePattern } from './flow/michell';

export type CameraView = 'perspective' | 'side' | 'top' | 'front' | 'foils';
export interface SceneHandle { capture(): string; reset(): void }
interface Props {
  design: Design;
  view: CameraView;
  wireframe: boolean;
  water: boolean;
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.dispose());
    }
  });
}

function meshGeometry(positions: number[], indices: number[], flat = false) {
  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  if (flat) geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();
  return geometry;
}

// Vertical NACA-section appendage hanging down from y = 0, leading edge towards +x (bow).
export function appendageGeometry(chord: number, depth: number, thickness: number, tipRatio = 0.68) {
  const steps = 16;
  const positions: number[] = [];
  const indices: number[] = [];
  const ring = 2 * steps;
  for (const [level, y] of [[0, 0], [1, -depth]] as const) {
    const c = chord * (level === 0 ? 1 : tipRatio);
    const sweep = level === 0 ? 0 : -(chord - c) * 0.6;
    for (let k = 0; k < ring; k++) {
      const upper = k < steps;
      const u = upper ? k / steps : (ring - k) / steps;
      const s = 0.5 * (1 - Math.cos(Math.PI * u));
      const half = 5 * thickness * c * (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s ** 2 + 0.2843 * s ** 3 - 0.1036 * s ** 4);
      positions.push(c / 2 - s * c + sweep, y, upper ? half : -half);
    }
  }
  for (let k = 0; k < ring; k++) {
    const a = k;
    const b = (k + 1) % ring;
    indices.push(a, b, b + ring, a, b + ring, a + ring);
  }
  for (let k = 1; k < ring - 1; k++) {
    indices.push(0, k + 1, k);
    indices.push(ring, ring + k, ring + k + 1);
  }
  return meshGeometry(positions, indices);
}

function hullMeshes(h: HullSpec, d: Design, mat: (color: string, metal?: number) => THREE.MeshStandardMaterial) {
  const group = new THREE.Group();
  const m = h.shape === 'chine' ? 16 : 28;
  const skin = outerSkin(h, 64, m);
  const hull = new THREE.Mesh(meshGeometry(skin.positions, skin.indices, h.shape === 'chine'), mat(d.hullColor, 0.2));
  hull.name = 'hull';
  group.add(hull);
  const transom = sectionPoints(h, 0, m);
  const tx = stationX(h, 0);
  const transomPositions = transom.flatMap(([z, y]) => [tx, y, z]);
  const transomIndices: number[] = [];
  for (let i = 1; i < m; i++) transomIndices.push(0, i + 1, i);
  group.add(new THREE.Mesh(meshGeometry(transomPositions, transomIndices), mat(d.hullColor, 0.2)));
  const deck: number[] = [];
  const deckIndices: number[] = [];
  const outline: THREE.Vector3[] = [];
  skin.stations.forEach((t, k) => {
    const x = stationX(h, t);
    const w = halfWidth(h, t);
    const y = deckY(h, t);
    deck.push(x, y + 0.0004, h.z - w, x, y + 0.0004, h.z + w);
    outline.push(new THREE.Vector3(x, y + 0.0008, h.z + w));
    if (k < skin.stations.length - 1) deckIndices.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3);
  });
  group.add(new THREE.Mesh(meshGeometry(deck, deckIndices), mat('#ecebe1')));
  const lineMaterial = () => new THREE.LineBasicMaterial({ color: '#f2f6f4', transparent: true, opacity: 0.85 });
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), lineMaterial()));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline.map(p => new THREE.Vector3(p.x, p.y, 2 * h.z - p.z))), lineMaterial()));
  return group;
}

export function buildBoat(d: Design, wireframe: boolean, eq: Equilibrium = equilibrium(d)): THREE.Group {
  const boat = new THREE.Group();
  const L = d.length;
  const material = (color: string, metalness = 0.05) => new THREE.MeshStandardMaterial({
    color, metalness, roughness: 0.45, wireframe, side: THREE.DoubleSide,
  });
  const addMesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    boat.add(mesh);
    return mesh;
  };
  const line = (points: THREE.Vector3[], color = '#a8b8c3', opacity = 0.8) => {
    boat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
  };
  const spar = (start: THREE.Vector3, end: THREE.Vector3, radius: number, color = '#dfe7e9') => {
    const direction = end.clone().sub(start);
    const mesh = addMesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 12), material(color, 0.6));
    mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  };
  const specs = hullSpecs(d);
  specs.forEach(h => boat.add(hullMeshes(h, d, material)));
  const main = specs.find(h => h.main) ?? specs[0];
  const tAt = (h: HullSpec, x: number) => Math.min(1, Math.max(0, x / h.length + 0.5));

  const set = appendages(d);
  set.foils.forEach(a => {
    const mesh = addMesh(appendageGeometry(a.chord, a.depth + 0.006 * L, a.thickness), material(a.kind === 'rudder' ? '#3d5b63' : '#304955', 0.3), a.x, a.top + 0.006 * L, a.z);
    mesh.name = a.kind;
  });
  if (set.bulb) {
    const bulb = addMesh(new THREE.SphereGeometry(1, 32, 16), material('#26363f', 0.7), set.bulb.x, set.bulb.y, set.bulb.z);
    bulb.scale.set(set.bulb.length / 2, set.bulb.diameter / 2, set.bulb.diameter / 2);
    bulb.name = 'bulb';
  }
  const hatchT = tAt(main, -0.1 * L);
  const hatch = addMesh(new THREE.BoxGeometry(0.16 * L, 0.006 * L, halfWidth(main, hatchT) * 0.9), material('#405d63', 0.3), -0.1 * L, deckY(main, hatchT) + 0.003 * L, main.z);
  hatch.name = 'hatch';

  const beamY = Math.max(...specs.map(h => deckY(h, 0.5))) + 0.008 * L;
  if (d.type !== 'mono') {
    const outer = specs.filter(h => h.z !== 0);
    const span = Math.abs(outer[0].z - outer[1].z);
    [-0.2, 0.16].forEach(position => {
      spar(new THREE.Vector3(L * position, beamY, -span / 2), new THREE.Vector3(L * position, beamY, span / 2), Math.max(0.004, 0.011 * L), '#edf1ec');
    });
    if (d.type === 'cat') {
      const net = addMesh(new THREE.PlaneGeometry(0.36 * L, span - outer[0].width * 0.8), new THREE.MeshStandardMaterial({ color: '#9fb9b8', transparent: true, opacity: 0.55, side: THREE.DoubleSide, wireframe }), -0.02 * L, beamY - 0.002, 0);
      net.rotation.x = -Math.PI / 2;
    }
  }

  const mx = mastX(d);
  const base = d.type === 'cat' ? beamY : deckY(main, tAt(main, mx));
  const H = d.mastHeight;
  const size = sailDimensions(d);
  const boomY = base + 0.07 * H;
  const radius = Math.max(0.003, 0.0045 * H);
  spar(new THREE.Vector3(mx, base, 0), new THREE.Vector3(mx, base + H, 0), radius);
  spar(new THREE.Vector3(mx, boomY, 0), new THREE.Vector3(mx - size.foot, boomY, 0), radius * 0.75);
  const bowX = d.type === 'cat' ? 0.4 * L : 0.48 * L;
  const bowY = d.type === 'cat' ? beamY : deckY(main, 0.98);
  line([new THREE.Vector3(mx, base + H * 0.86, 0), new THREE.Vector3(bowX, bowY, 0)]);
  line([new THREE.Vector3(mx, base + H, 0), new THREE.Vector3(-0.47 * L, deckY(main, 0.02), 0)]);
  const shroudZ = d.type === 'mono' ? halfWidth(main, tAt(main, mx)) : Math.min(d.beam / 2, 0.45 * H);
  [-1, 1].forEach(sign => line([new THREE.Vector3(mx, base + H * 0.78, 0), new THREE.Vector3(mx - 0.03 * L, base, sign * shroudZ)]));
  spar(new THREE.Vector3(mx, base + H * 0.5, -0.07 * H), new THREE.Vector3(mx, base + H * 0.5, 0.07 * H), radius * 0.4);

  function sail(height: number, foot: number, top: number, direction: number, startY: number, color: string) {
    const vertices: number[] = [];
    const indices: number[] = [];
    const steps = 24;
    const point = (u: number, v: number) => {
      const width = foot * (1 - v) + top * v;
      return new THREE.Vector3(mx + direction * u * width, startY + v * height,
        radius + Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * d.camber / 100 * foot);
    };
    for (let row = 0; row <= steps; row++) {
      for (let column = 0; column <= steps; column++) {
        const p = point(column / steps, row / steps);
        vertices.push(p.x, p.y, p.z);
        if (row < steps && column < steps) {
          const a = row * (steps + 1) + column;
          indices.push(a, a + 1, a + steps + 1, a + 1, a + steps + 2, a + steps + 1);
        }
      }
    }
    const mat = material(color);
    mat.roughness = 0.82;
    addMesh(meshGeometry(vertices, indices), mat).name = direction === -1 ? 'main-sail' : 'jib-sail';
    for (const v of [0.2, 0.4, 0.6, 0.8]) line(Array.from({ length: 25 }, (_, i) => point(i / 24, v)), '#faf1df', 0.32);
    line(Array.from({ length: 25 }, (_, i) => point(1, i / 24)), '#f5e4c9', 0.8);
  }
  sail(size.height, size.foot, size.top, -1, boomY + 0.005 * H, '#e8a078');
  if (d.jibArea > 0) sail(size.jibHeight, size.jibFoot, 0, 1, base + 0.06 * H, '#f1d5b0');
  const pennant = addMesh(new THREE.ConeGeometry(0.012 * H, 0.04 * H, 3), material('#43c9bc'), mx - 0.02 * H, base + H, 0);
  pennant.rotation.z = Math.PI / 2;
  boat.add(buildFoils(d, eq.restLevel, d.flow.speed, wireframe));
  boat.position.y = -eq.level;
  return boat;
}

// Linear Kelvin wave field (thin-ship spectrum), normalised and exaggerated for display.
export function buildWaves(d: Design, eq: Equilibrium): THREE.Mesh | null {
  const hulls = eq.prepared.map(p => michellHull(p, eq.level, 40, 8)).filter((h): h is MichellHull => h !== null);
  if (!hulls.length || eq.flying) return null;
  const L = d.length;
  const [nx, nz] = [120, 64];
  const xMin = -3.2 * L;
  const xMax = 0.9 * L;
  const zHalf = Math.max(1.4 * L, d.beam);
  const geometry = new THREE.PlaneGeometry(xMax - xMin, 2 * zHalf, nx, nz);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((xMin + xMax) / 2, 0, 0);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const points = Array.from({ length: position.count }, (_, i) => ({ x: position.getX(i), y: position.getZ(i) }));
  const field = wavePattern(hulls, d.flow.speed, points, 200);
  const mask = points.map(p => {
    const ahead = (p.x - 0.45 * L) / (0.25 * L);
    const front = ahead <= 0 ? 1 : Math.exp(-ahead * ahead);
    const edge = Math.min(1, (zHalf - Math.abs(p.y)) / (0.3 * zHalf), (p.x - xMin) / (0.4 * L));
    return front * Math.max(0, edge);
  });
  let max = 1e-12;
  field.forEach((v, i) => { max = Math.max(max, Math.abs(v * mask[i])); });
  const amplitude = 0.03 * L;
  const colors: number[] = [];
  const crest = new THREE.Color('#9fefff');
  const trough = new THREE.Color('#0d3f57');
  const neutral = new THREE.Color('#1d4b60');
  field.forEach((v, i) => {
    const h = v * mask[i] / max;
    position.setY(i, h * amplitude - 0.0015);
    const c = neutral.clone().lerp(h >= 0 ? crest : trough, Math.min(1, Math.abs(h) * 1.4));
    colors.push(c.r, c.g, c.b);
  });
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.78, roughness: 0.25, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false,
  }));
  mesh.name = 'wave-field';
  return mesh;
}

const BoatScene = forwardRef<SceneHandle, Props>(function BoatScene({ design, view, wireframe, water }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
    controls: OrbitControls; boat: THREE.Group; water: THREE.Group; waves: THREE.Group;
  } | null>(null);
  const [error, setError] = useState('');
  const resetRef = useRef(() => {});
  useImperativeHandle(ref, () => ({
    capture: () => {
      if (!state.current) throw new Error('Die 3D-Ansicht ist nicht verfügbar.');
      const { renderer, scene, camera } = state.current;
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    },
    reset: () => resetRef.current(),
  }), []);
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch (cause) {
      setError(`3D konnte nicht gestartet werden: ${cause instanceof Error ? cause.message : String(cause)}. Bitte Grafiktreiber und Hardwarebeschleunigung prüfen.`);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor('#111e2c');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#111e2c', 8, 25);
    scene.add(new THREE.HemisphereLight('#edf6ff', '#446375', 2.6));
    const key = new THREE.DirectionalLight('#fff0d9', 3.5);
    key.position.set(2, 5, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#77d6ed', 2);
    rim.position.set(-4, 2, -3);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 60);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 0.3;
    controls.maxDistance = 15;
    controls.maxPolarAngle = Math.PI * 0.82;
    const waterGroup = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: '#172f3e', transparent: true, opacity: 0.52, roughness: 0.38, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.003;
    waterGroup.add(plane);
    const grid = new THREE.GridHelper(20, 100, '#3c6574', '#274553');
    grid.position.y = -0.002;
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.42;
    waterGroup.add(grid);
    const waves = new THREE.Group();
    waterGroup.add(waves);
    scene.add(waterGroup);
    const boat = new THREE.Group();
    scene.add(boat);
    state.current = { renderer, scene, camera, controls, boat, water: waterGroup, waves };
    const resize = new ResizeObserver(() => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      resize.disconnect();
      renderer.setAnimationLoop(null);
      disposeGroup(state.current!.boat);
      disposeGroup(waterGroup);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const eq = equilibrium(design);
    s.scene.remove(s.boat);
    disposeGroup(s.boat);
    s.boat = buildBoat(design, wireframe, eq);
    s.scene.add(s.boat);
    s.waves.children.slice().forEach(child => { s.waves.remove(child); disposeGroup(child); });
    if (!water || !design.flow.waves) return;
    const timer = window.setTimeout(() => {
      const mesh = buildWaves(design, eq);
      if (mesh && state.current) state.current.waves.add(mesh);
    }, 140);
    return () => window.clearTimeout(timer);
  }, [design, wireframe, water]);
  useEffect(() => {
    if (state.current) state.current.water.visible = water && view !== 'foils';
  }, [water, view]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const reset = () => {
      const bounds = new THREE.Box3().setFromObject(s.boat);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const span = Math.max(size.y, size.x, size.z);
      const distance = span * 1.95 / Math.min(1, s.camera.aspect);
      s.controls.target.set(center.x, center.y * 0.91, 0);
      const target = s.controls.target;
      s.camera.up.set(0, 1, 0);
      if (view === 'foils') {
        const foilDistance = Math.max(design.beam * 1.7, design.foils.span * 3.3, design.length * 0.6) / Math.min(1, s.camera.aspect);
        target.set(design.length * (0.5 - design.foils.position / 100), -design.foils.immersion * 0.6, 0);
        s.camera.position.set(target.x + foilDistance * 0.35, target.y - foilDistance * 0.15, foilDistance);
      } else if (view === 'side') s.camera.position.set(target.x, target.y, distance);
      else if (view === 'top') {
        s.camera.position.set(target.x, distance, 0.01);
        s.camera.up.set(1, 0, 0);
      } else if (view === 'front') s.camera.position.set(distance, target.y, 0);
      else s.camera.position.set(distance * 0.57, target.y + distance * 0.26, distance * 0.83);
      s.camera.lookAt(target);
      s.controls.update();
    };
    resetRef.current = reset;
    reset();
  }, [view, design.type, design.length, design.beam, design.hullDepth, design.finDepth, design.mastHeight, design.mastPosition, design.mainArea, design.jibArea, design.sailShape, design.foils]);
  return <div className="scene-host" ref={host}>{error && <div className="scene-error" role="alert">{error}</div>}</div>;
});

export default BoatScene;
