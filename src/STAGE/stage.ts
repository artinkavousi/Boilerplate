import {
  AxesHelper,
  Color,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Texture,
  WebGLRenderer
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { WebGPURenderer } from 'three/examples/jsm/renderers/webgpu/WebGPURenderer.js';
import type { Config } from '../config.js';
import { CameraRig } from './camera.js';
import { LightRig } from './light.js';

export type RendererLike = WebGLRenderer | WebGPURenderer;

export class Stage {
  readonly scene: Scene;
  readonly camera: CameraRig['camera'];
  readonly cameraRig: CameraRig;
  readonly lightRig: LightRig;
  private readonly ground: Mesh;
  private env?: Texture;
  private pmrem?: PMREMGenerator;

  constructor(
    renderer: RendererLike,
    config: Config
  ) {
    this.scene = new Scene();
    this.scene.background = new Color(config.stage.background);
    (this.scene as any).environmentIntensity = config.lights.envMapIntensity;

    this.cameraRig = new CameraRig(config.camera);
    this.camera = this.cameraRig.camera;

    this.lightRig = new LightRig(config.lights);
    this.scene.add(this.lightRig);

    const grid = new GridHelper(config.stage.gridSize, config.stage.gridDivisions, 0x222222, 0x111111);
    grid.position.y = 0.001;
    this.scene.add(grid);

    const axes = new AxesHelper(1.5);
    axes.position.y = 0.002;
    this.scene.add(axes);

    const groundGeo = new PlaneGeometry(config.stage.gridSize, config.stage.gridSize);
    const groundMat = new MeshStandardMaterial({
      color: new Color(config.stage.background).multiplyScalar(1.1),
      roughness: 0.9,
      metalness: 0
    });
    this.ground = new Mesh(groundGeo, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    if (renderer instanceof WebGLRenderer) {
      this.pmrem = new PMREMGenerator(renderer);
      this.env = this.pmrem.fromScene(new RoomEnvironment(), 0.1).texture;
      this.scene.environment = this.env;
      this.scene.background = this.scene.background ?? new Color('#000000');
    }
  }

  add(node: Object3D): void {
    this.scene.add(node);
  }

  remove(node: Object3D): void {
    this.scene.remove(node);
  }

  resize(size: { width: number; height: number }): void {
    this.cameraRig.resize(size.width, size.height);
  }

  dispose(): void {
    this.ground.geometry.dispose();
    (this.ground.material as MeshStandardMaterial).dispose();
    if (this.env) {
      this.env.dispose();
    }
    this.pmrem?.dispose();
  }
}
