import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  TorusGeometry,
  TorusKnotGeometry
} from 'three';
import MeshPhysicalNodeMaterial from 'three/src/materials/nodes/MeshPhysicalNodeMaterial.js';
import { Convas } from './CONVAS';

const canvas = document.querySelector('#app');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Canvas element with id "app" not found.');
}

const app = new Convas(canvas, {
  config: {
    renderer: { exposure: 1.3 },
    camera: { position: [5, 2.8, 7], target: [0, 1.2, 0] },
    postfx: {
      enabled: true,
      bloom: { strength: 0.85, radius: 0.4, threshold: 0.45 },
      dof: { focus: 1.4, aperture: 0.018, maxBlur: 0.008 },
      vignette: 0.3,
      grain: 0.28
    }
  }
});

const sculpture = createSculpture();
const halo = createHaloParticles();

app.stage.add(sculpture);
app.stage.add(halo);

let spinEnabled = true;
const disposeSpin = app.onTick((delta, elapsed) => {
  if (!spinEnabled) return;
  sculpture.rotation.y += delta * 0.5;
  sculpture.rotation.x = Math.sin(elapsed * 0.35) * 0.2;
  halo.rotation.y -= delta * 0.2;
  halo.children.forEach((child, index) => {
    child.position.y = 1.5 + Math.sin(elapsed * 0.6 + index) * 0.35;
    child.rotation.y += delta * 0.4;
  });
});

app.dashboard.section('demo', {
  title: 'Demo Scene',
  params: {
    spin: { value: spinEnabled, label: 'Animate' }
  },
  onChange: (key, value) => {
    if (key === 'spin') {
      spinEnabled = Boolean(value);
    }
  }
});

window.addEventListener('beforeunload', () => {
  disposeSpin();
});

Object.assign(window, { app });

function createSculpture(): Group {
  const group = new Group();

  const glassMaterial = new MeshPhysicalNodeMaterial({
    metalness: 0.05,
    roughness: 0.04,
    transmission: 0.96,
    thickness: 1.6,
    attenuationColor: new Color('#6ea5ff'),
    attenuationDistance: 1.2,
    iridescence: 1,
    iridescenceIOR: 1.25,
    iridescenceThicknessRange: [140, 420]
  });
  glassMaterial.side = DoubleSide;

  const glassCore = new Mesh(new SphereGeometry(1.1, 96, 96), glassMaterial);
  glassCore.castShadow = true;
  glassCore.position.y = 1.2;
  group.add(glassCore);

  const brushedMetal = new MeshPhysicalMaterial({
    color: new Color('#f4c49a'),
    metalness: 0.75,
    roughness: 0.22,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18
  });

  const ribbon = new Mesh(new TorusKnotGeometry(0.7, 0.18, 220, 32), brushedMetal);
  ribbon.position.set(-1.8, 1.2, 0);
  ribbon.castShadow = true;
  group.add(ribbon);

  const ring = new Mesh(new TorusGeometry(1.4, 0.05, 32, 128), brushedMetal.clone());
  ring.position.set(1.75, 1.2, 0);
  ring.rotation.x = MathUtils.degToRad(70);
  ring.rotation.z = MathUtils.degToRad(30);
  group.add(ring);

  return group;
}

function createHaloParticles(): Group {
  const group = new Group();
  const count = 200;
  const radius = 2.2;

  const geometry = new BufferGeometry();
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const offset = MathUtils.randFloatSpread(0.35);
    const x = Math.cos(angle) * (radius + offset);
    const z = Math.sin(angle) * (radius + offset);
    const y = 1.5 + MathUtils.randFloatSpread(0.35);
    positions.push(x, y, z);
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

  const material = new PointsMaterial({
    size: 0.05,
    color: new Color('#a8c6ff'),
    transparent: true,
    opacity: 0.85
  });

  const points = new Points(geometry, material);
  group.add(points);

  for (let i = 0; i < 3; i++) {
    const pod = new Mesh(
      new TorusGeometry(0.25, 0.04, 24, 48),
      new MeshPhysicalMaterial({
        color: new Color('#8fb0ff'),
        metalness: 0.25,
        roughness: 0.35,
        transmission: 0.6,
        thickness: 0.4
      })
    );
    pod.position.set(Math.cos(i) * 2.1, 1.5, Math.sin(i) * 2.1);
    group.add(pod);
  }

  return group;
}
