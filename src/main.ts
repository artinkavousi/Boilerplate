import { Color, DoubleSide, Mesh, MeshPhysicalMaterial, SphereGeometry, TorusKnotGeometry } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/examples/jsm/nodes/materials/MeshPhysicalNodeMaterial.js';
import { Convas } from './CONVAS.js';

const canvas = document.querySelector('#app') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Canvas element with id "app" not found.');
}

const app = new Convas(canvas, {
  config: {
    renderer: { exposure: 1.2 },
    camera: { position: [4, 2.5, 6] }
  }
});

const glassMaterial = new MeshPhysicalNodeMaterial({
  metalness: 0,
  roughness: 0.05,
  transmission: 0.95,
  thickness: 1.2,
  attenuationColor: new Color('#66aaff'),
  attenuationDistance: 1.5,
  iridescence: 1,
  iridescenceIOR: 1.3,
  iridescenceThicknessRange: [150, 450]
});

glassMaterial.side = DoubleSide;

const glassSphere = new Mesh(new SphereGeometry(1.1, 64, 64), glassMaterial);
glassSphere.position.set(0, 1.25, 0);
app.stage.add(glassSphere);

torusSetup(app);

function torusSetup(app: Convas): void {
  const torusMat = new MeshPhysicalMaterial({
    color: new Color('#f0b07a'),
    metalness: 0.65,
    roughness: 0.25,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15
  });
  const torus = new Mesh(new TorusKnotGeometry(0.6, 0.22, 256, 32), torusMat);
  torus.position.set(-2, 1.1, 0);
  torus.castShadow = true;
  app.stage.add(torus);
}

// Expose for hot-reload demos
(Object.assign(window, { app }))
