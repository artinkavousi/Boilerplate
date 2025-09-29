import { PerspectiveCamera, Vector3 } from 'three';
import type { CameraConfig } from '../config';

export class CameraRig {
  readonly camera: PerspectiveCamera;
  readonly target: Vector3;

  constructor(config: CameraConfig) {
    this.camera = new PerspectiveCamera(config.fov, 1, config.near, config.far);
    this.camera.position.fromArray(config.position);
    this.target = new Vector3().fromArray(config.target);
    this.lookAtTarget();
  }

  lookAtTarget(): void {
    this.camera.lookAt(this.target);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
