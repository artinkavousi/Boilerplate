import * as THREE from 'three';
import {
  PointsNodeMaterial,
  vec3,
  float,
  storage,
  uniform,
  positionLocal,
  attribute,
  cameraPosition,
  color,
  clamp,
  smoothstep,
} from 'three/examples/jsm/nodes/Nodes.js';
import { ParticlesBufferBundle, bindStorageToNodeMaterial } from './Particles.buffers';
import { ParticlesOptions, colorToLinear } from './Particles.params';

export class ParticlesRenderer {
  readonly material: PointsNodeMaterial;
  readonly points: THREE.Points;
  readonly geometry: THREE.BufferGeometry;

  constructor(readonly bundle: ParticlesBufferBundle, readonly opts: Required<ParticlesOptions>) {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setDrawRange(0, opts.counts.maxParticles);

    const uniforms = uniform({
      pointSize: float(opts.render.size ?? 0.02),
      opacity: float(opts.render.opacity ?? 1.0),
      additive: float(opts.render.additive ? 1 : 0),
      impostor: float(opts.render.impostor ? 1 : 0),
      thickness: float(opts.render.thicknessCue ? 1 : 0),
      color: color(colorToLinear(opts.render.color ?? '#ffffff')),
    });

    this.material = new PointsNodeMaterial();
    this.material.transparent = true;
    this.material.depthWrite = !opts.render.additive;
    this.material.blending = opts.render.additive ? THREE.AdditiveBlending : THREE.NormalBlending;

    const positionNode = storage(bundle.particles.Pos.buffer, 'vec4<f32>');
    this.material.positionNode = vec3(positionNode.xyz);
    const viewDir = vec3(cameraPosition).sub(positionLocal);
    const dist = viewDir.length();
    const sizeScale = uniforms.pointSize.mul(clamp(float(1.0).div(dist), 0.0, 1.0));
    this.material.sizeNode = sizeScale.mul(float(300.0));
    const alpha = uniforms.opacity.mul(smoothstep(float(0.5), float(0.46), attribute('uv', 'vec2')));
    this.material.colorNode = uniforms.color;
    this.material.alphaNode = alpha;

    bindStorageToNodeMaterial(this.material, bundle);

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  setMaxParticles(count: number): void {
    this.geometry.setDrawRange(0, count);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

