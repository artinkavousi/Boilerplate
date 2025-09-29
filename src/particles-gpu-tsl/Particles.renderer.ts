import * as THREE from 'three';
import { ParticlesBufferBundle } from './Particles.buffers';
import { ParticlesOptions } from './Particles.params';

export class ParticlesRenderer {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.PointsMaterial;
  readonly points: THREE.Points;

  private positionAttr: THREE.BufferAttribute;
  private colorAttr: THREE.BufferAttribute;

  constructor(readonly bundle: ParticlesBufferBundle, readonly opts: Required<ParticlesOptions>) {
    this.geometry = new THREE.BufferGeometry();

    this.positionAttr = new THREE.Float32BufferAttribute(bundle.particles.position, 3);
    this.geometry.setAttribute('position', this.positionAttr);

    const colors = new Float32Array(bundle.maxParticles * 3);
    for (let i = 0; i < bundle.maxParticles; i++) {
      const base = i * 3;
      colors[base] = 1;
      colors[base + 1] = 1;
      colors[base + 2] = 1;
    }
    this.colorAttr = new THREE.Float32BufferAttribute(colors, 3);
    this.geometry.setAttribute('color', this.colorAttr);

    this.material = new THREE.PointsMaterial({
      size: opts.render.size ?? 0.025,
      color: new THREE.Color(opts.render.color ?? '#4dc9ff'),
      transparent: true,
      opacity: opts.render.opacity ?? 1,
      blending: opts.render.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !opts.render.additive,
      vertexColors: true,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.geometry.setDrawRange(0, 0);
  }

  update(alive: number): void {
    this.geometry.setDrawRange(0, alive);
    this.positionAttr.needsUpdate = true;
  }

  updateRenderOptions(render: Required<ParticlesOptions>['render']): void {
    this.material.size = render.size ?? this.material.size;
    this.material.color.set(render.color ?? '#ffffff');
    this.material.opacity = render.opacity ?? this.material.opacity;
    this.material.blending = render.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.material.depthWrite = !render.additive;
    this.material.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
