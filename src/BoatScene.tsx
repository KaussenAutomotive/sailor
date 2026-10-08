import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Design, hullLayout, mastX, sailDimensions } from './design';
import { buildFoils } from './foilGeometry';
import { foilPreviewHeight } from './foils';

export type CameraView = 'perspective' | 'side' | 'top' | 'front';
export interface SceneHandle { capture(): string; reset(): void }
interface Props {
  design: Design;
  view: CameraView;
  wireframe: boolean;
  water: boolean;
}

function disposeGroup(group: THREE.Group) {
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.dispose());
    }
  });
}

export function buildBoat(d: Design, wireframe: boolean): THREE.Group {
  const boat = new THREE.Group();
  const material = (color: string, metalness = 0.05) => new THREE.MeshStandardMaterial({
    color, metalness, roughness: 0.45, wireframe, side: THREE.DoubleSide,
  });
  const addMesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    boat.add(mesh);
    return mesh;
  };
  const line = (points: THREE.Vector3[], color = '#a8b8c3', opacity = 0.8) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    boat.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
  };
  const spar = (start: THREE.Vector3, end: THREE.Vector3, radius: number, color = '#dfe7e9') => {
    const direction = end.clone().sub(start);
    const mesh = addMesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 12), material(color, 0.6), 0, 0, 0);
    mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  };
  const crossCount = d.hullShape === 'chine' ? 8 : 24;
  const hulls = hullLayout(d);
  hulls.forEach(hull => {
    const positions: number[] = [];
    const indices: number[] = [];
    const deck: number[] = [];
    const deckIndices: number[] = [];
    const count = 48;
    const depth = Math.min(hull.width * 0.46, 0.95, d.draft * 0.65);
    const outline: THREE.Vector3[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = (t - 0.5) * hull.length;
      const shape = Math.pow(Math.sin(Math.PI * (0.13 + t * 0.87)), d.hullShape === 'slender' ? 0.85 : 0.58);
      const w = Math.max(0.012, shape * hull.width / 2);
      const sheer = 0.33 + Math.pow(t, 4) * 0.18;
      for (let j = 0; j < crossCount; j++) {
        const theta = j / crossCount * Math.PI * 2;
        positions.push(x, sheer - (1 - Math.cos(theta)) * depth * 0.5, hull.z + Math.sin(theta) * w);
        if (i < count) {
          const a = i * crossCount + j;
          const b = i * crossCount + (j + 1) % crossCount;
          indices.push(a, b, a + crossCount, b, b + crossCount, a + crossCount);
        }
      }
      deck.push(x, sheer + 0.015, hull.z - w, x, sheer + 0.015, hull.z + w);
      if (i < count) {
        const a = i * 2;
        deckIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      outline.push(new THREE.Vector3(x, sheer + 0.03, hull.z + w));
    }
    for (let j = 1; j < crossCount - 1; j++) {
      indices.push(0, j + 1, j);
      const end = count * crossCount;
      indices.push(end, end + j, end + j + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    addMesh(geometry, material(d.hullColor, 0.2), 0, 0, 0).name = 'hull';
    const deckGeometry = new THREE.BufferGeometry();
    deckGeometry.setAttribute('position', new THREE.Float32BufferAttribute(deck, 3));
    deckGeometry.setIndex(deckIndices);
    deckGeometry.computeVertexNormals();
    addMesh(deckGeometry, material('#ecebe1'), 0, 0, 0);
    line(outline, '#f2f6f4');
    line(outline.map(p => new THREE.Vector3(p.x, p.y, hull.z * 2 - p.z)), '#f2f6f4');
    const keelTop = 0.33 - depth;
    addMesh(new THREE.BoxGeometry(hull.length * 0.11, d.draft + keelTop, hull.width * 0.08), material('#304955'), -hull.length * 0.08, (keelTop - d.draft) / 2, hull.z);
    addMesh(new THREE.BoxGeometry(0.45, d.draft * 0.56, 0.08), material('#3d5b63'), -hull.length * 0.43, -d.draft * 0.3, hull.z);
  });
  if (d.type !== 'mono') {
    [-0.23, 0.16].forEach(position => {
      addMesh(new THREE.BoxGeometry(0.36, 0.25, d.beam * 0.88), material('#edf1ec'), d.length * position, 0.42, 0);
    });
    if (d.type === 'cat') {
      addMesh(new THREE.BoxGeometry(d.length * 0.32, 0.13, d.beam * 0.65), material('#b7cac9'), -d.length * 0.08, 0.48, 0);
    }
  }
  const cabinWidth = d.type === 'cat' ? d.beam * 0.48 : hulls[0].width * 0.56;
  const cabin = addMesh(new THREE.SphereGeometry(1, 28, 16), material('#e8ede8'), -d.length * 0.06, 0.37, 0);
  cabin.scale.set(d.length * 0.18, 0.65, cabinWidth / 2);
  const window = addMesh(new THREE.SphereGeometry(1, 24, 12), material('#1d3845', 0.5), -d.length * 0.025, 0.51, 0);
  window.scale.set(d.length * 0.108, 0.55, cabinWidth / 2 + 0.016);
  addMesh(new THREE.BoxGeometry(d.length * 0.11, 0.09, cabinWidth * 0.75), material('#405d63'), -d.length * 0.31, 0.43, 0);

  const mx = mastX(d);
  const base = 0.4;
  const size = sailDimensions(d);
  spar(new THREE.Vector3(mx, 0.35, 0), new THREE.Vector3(mx, base + d.mastHeight, 0), 0.065);
  spar(new THREE.Vector3(mx, base + 0.4, 0), new THREE.Vector3(mx - size.foot, base + 0.4, 0), 0.048);
  line([new THREE.Vector3(mx, base + d.mastHeight * 0.94, 0), new THREE.Vector3(d.length * 0.48, 0.5, 0)]);
  line([new THREE.Vector3(mx, base + d.mastHeight, 0), new THREE.Vector3(-d.length * 0.46, 0.4, 0)]);
  [-1, 1].forEach(sign => line([
    new THREE.Vector3(mx, base + d.mastHeight * 0.72, 0),
    new THREE.Vector3(mx - 0.25, 0.4, sign * d.beam * 0.4),
  ]));
  spar(new THREE.Vector3(mx, base + d.mastHeight * 0.48, -0.8), new THREE.Vector3(mx, base + d.mastHeight * 0.48, 0.8), 0.025);

  function sail(height: number, foot: number, top: number, direction: number, color: string) {
    const vertices: number[] = [];
    const indices: number[] = [];
    const steps = 24;
    const point = (u: number, v: number) => {
      const width = foot * (1 - v) + top * v;
      return new THREE.Vector3(mx + direction * u * width, base + 0.42 + v * height,
        0.025 + Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * d.camber / 100 * foot);
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
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mat = material(color);
    mat.roughness = 0.82;
    addMesh(geometry, mat, 0, 0, 0).name = direction === -1 ? 'main-sail' : 'jib-sail';
    for (const v of [0.2, 0.4, 0.6, 0.8]) {
      line(Array.from({ length: 25 }, (_, i) => point(i / 24, v)), '#faf1df', 0.32);
    }
    line(Array.from({ length: 25 }, (_, i) => point(1, i / 24)), '#f5e4c9', 0.8);
  }
  sail(size.height, size.foot, size.top, -1, '#e8a078');
  if (d.jibArea > 0) sail(size.jibHeight, size.jibFoot, 0, 1, '#f1d5b0');
  const pennant = addMesh(new THREE.ConeGeometry(0.23, 0.65, 3), material('#43c9bc'), mx, base + d.mastHeight, 0);
  pennant.rotation.z = Math.PI / 2;
  boat.add(buildFoils(d.length, d.beam * (d.type === 'mono' ? 0.36 : 0.42), d.foils, wireframe));
  boat.position.y = foilPreviewHeight(d.foils);
  return boat;
}

const BoatScene = forwardRef<SceneHandle, Props>(function BoatScene({ design, view, wireframe, water }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
    controls: OrbitControls; boat: THREE.Group; water: THREE.Group;
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
    scene.fog = new THREE.Fog('#111e2c', 45, 110);
    scene.add(new THREE.HemisphereLight('#edf6ff', '#446375', 2.6));
    const key = new THREE.DirectionalLight('#fff0d9', 3.5);
    key.position.set(8, 20, 12);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#77d6ed', 2);
    rim.position.set(-15, 8, -10);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 250);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 5;
    controls.maxDistance = 85;
    controls.maxPolarAngle = Math.PI * 0.82;
    const waterGroup = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(180, 180),
      new THREE.MeshStandardMaterial({ color: '#172f3e', transparent: true, opacity: 0.52, roughness: 0.38, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.25;
    waterGroup.add(plane);
    const grid = new THREE.GridHelper(140, 100, '#3c6574', '#274553');
    grid.position.y = -0.24;
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.42;
    waterGroup.add(grid);
    scene.add(waterGroup);
    const boat = new THREE.Group();
    scene.add(boat);
    state.current = { renderer, scene, camera, controls, boat, water: waterGroup };
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
    s.scene.remove(s.boat);
    disposeGroup(s.boat);
    s.boat = buildBoat(design, wireframe);
    s.scene.add(s.boat);
    s.water.visible = water;
  }, [design, wireframe, water]);
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
      if (view === 'side') s.camera.position.set(target.x, target.y, distance);
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
  }, [view, design.type, design.length, design.beam, design.draft, design.mastHeight, design.mastPosition, design.mainArea, design.jibArea, design.sailShape, design.foils]);
  return <div className="scene-host" ref={host}>{error && <div className="scene-error" role="alert">{error}</div>}</div>;
});

export default BoatScene;
