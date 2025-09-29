/**
 * # Particles.GPU.TSL
 *
 * CPU-based particle simulation facade that mirrors the expected hot-swappable API.
 * The implementation focuses on providing a predictable interface for integration
 * and UI control within the scaffold application.
 */

import { WebGPURenderer } from 'three/webgpu';
import * as THREE from 'three';
import { ParticlesBufferAllocator, ParticlesBufferBundle } from './Particles.buffers';
import { ParticlesGraph } from './Particles.graph';
import { ParticlesRenderer } from './Particles.renderer';
import {
  ParticlesOptions,
  SimStats,
  createDefaultOptions,
  mergeOptions,
  validateOptions,
  applyPreset,
} from './Particles.params';

export type ParticlesApp = {
  scene: THREE.Scene;
  renderer: WebGPURenderer;
  onTick: (fn: (dt: number, elapsed: number) => void) => () => void;
  offTick: (fn: (dt: number, elapsed: number) => void) => void;
  ui?: { section(id: string, spec: any): void };
};

export class ParticlesSim {
  readonly renderer: WebGPURenderer;
  readonly options: Required<ParticlesOptions>;
  readonly allocator: ParticlesBufferAllocator;
  readonly buffers: ParticlesBufferBundle;
  readonly graph: ParticlesGraph;
  readonly particlesRenderer: ParticlesRenderer;

  private stats: SimStats = { fps: 0, dt: 0, alive: 0 };
  private emitAccumulator = 0;

  constructor(renderer: WebGPURenderer, opts?: ParticlesOptions) {
    if (!(renderer instanceof WebGPURenderer)) {
      throw new Error('ParticlesSim requires a Three.js WebGPURenderer instance.');
    }

    const options = mergeOptions(createDefaultOptions(), opts);
    validateOptions(options);

    this.renderer = renderer;
    this.options = options;
    this.allocator = new ParticlesBufferAllocator(options);
    this.buffers = this.allocator.bundle;
    this.graph = new ParticlesGraph(this.buffers, this.options);
    this.particlesRenderer = new ParticlesRenderer(this.buffers, this.options);

    this.seedFromEmitter();
  }

  attach(scene: THREE.Scene): void {
    scene.add(this.particlesRenderer.points);
  }

  detach(scene: THREE.Scene): void {
    scene.remove(this.particlesRenderer.points);
  }

  update(dt: number): void {
    const capped = Math.min(dt, this.options.time.dtMax ?? dt);
    const substeps = Math.max(1, this.options.time.substeps ?? 1);
    const step = capped / substeps;

    for (let i = 0; i < substeps; i++) {
      this.emitParticles(step);
      this.graph.step(step);
      this.applyBounds();
      this.integrateLifetime(step);
    }

    this.particlesRenderer.update(this.buffers.alive);
    this.stats.dt = step;
    this.stats.alive = this.buffers.alive;
    this.stats.fps = 1 / Math.max(capped, 1e-5);
  }

  setParams(patch: Partial<ParticlesOptions>): void {
    const prevMode = this.options.mode;
    mergeOptions(this.options, patch);
    validateOptions(this.options);

    if (patch.mode && patch.mode !== prevMode) {
      this.buffers.alive = 0;
      this.seedFromEmitter();
    }

    if (patch.render) {
      this.particlesRenderer.updateRenderOptions(this.options.render);
    }

    if (patch.emit) {
      this.buffers.alive = Math.min(this.buffers.alive, this.buffers.maxParticles);
      this.emitAccumulator = 0;
    }

    this.graph.setOptions(this.options);
  }

  getStats(): SimStats {
    return { ...this.stats };
  }

  dispose(): void {
    this.particlesRenderer.dispose();
    this.allocator.dispose();
  }

  private seedFromEmitter(): void {
    this.buffers.alive = 0;
    const seedCount = Math.min(this.buffers.maxParticles, Math.floor((this.options.emit.rate ?? 0) * 0.1));
    const dt = 1 / 60;
    for (let i = 0; i < seedCount; i++) {
      this.spawnParticle(dt);
    }
    this.particlesRenderer.update(this.buffers.alive);
  }

  private emitParticles(dt: number): void {
    const rate = this.options.emit.rate ?? 0;
    if (rate <= 0) return;
    this.emitAccumulator += rate * dt;
    const spawnCount = Math.min(Math.floor(this.emitAccumulator), this.buffers.maxParticles - this.buffers.alive);
    if (spawnCount <= 0) return;
    this.emitAccumulator -= spawnCount;
    for (let i = 0; i < spawnCount; i++) {
      this.spawnParticle(dt);
    }
  }

  private spawnParticle(dt: number): void {
    if (this.buffers.alive >= this.buffers.maxParticles) return;
    const index = this.buffers.alive++;
    const base = index * 3;
    const life = this.buffers.particles.life;
    const velocity = this.buffers.particles.velocity;
    const position = this.buffers.particles.position;

    const emitter = this.options.emit;
    const center = emitter.center ?? [0, 0.5, 0];

    if (emitter.type === 'box') {
      const half = emitter.half ?? [0.25, 0.25, 0.25];
      position[base] = center[0] + (Math.random() * 2 - 1) * half[0];
      position[base + 1] = center[1] + (Math.random() * 2 - 1) * half[1];
      position[base + 2] = center[2] + (Math.random() * 2 - 1) * half[2];
    } else {
      const radius = emitter.radius ?? 0.35;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = radius * Math.cbrt(Math.random());
      position[base] = center[0] + r * Math.sin(phi) * Math.cos(theta);
      position[base + 1] = center[1] + r * Math.cos(phi);
      position[base + 2] = center[2] + r * Math.sin(phi) * Math.sin(theta);
    }

    const speed = emitter.speed ?? 1.5;
    const jitter = emitter.jitter ?? 0.2;
    velocity[base] = (Math.random() * 2 - 1) * speed * 0.5;
    velocity[base + 1] = speed + Math.random() * jitter;
    velocity[base + 2] = (Math.random() * 2 - 1) * speed * 0.5;

    life[index] = 3 + Math.random() * 2;
  }

  private applyBounds(): void {
    const { position, velocity } = this.buffers.particles;
    const alive = this.buffers.alive;
    for (let i = 0; i < alive; i++) {
      const base = i * 3;
      if (position[base + 1] < 0) {
        position[base + 1] = 0;
        if (velocity[base + 1] < 0) velocity[base + 1] *= -0.4;
        velocity[base] *= 0.85;
        velocity[base + 2] *= 0.85;
      }
    }
  }

  private integrateLifetime(dt: number): void {
    const life = this.buffers.particles.life;
    const pos = this.buffers.particles.position;
    const vel = this.buffers.particles.velocity;
    let alive = this.buffers.alive;

    for (let i = alive - 1; i >= 0; i--) {
      life[i] -= dt;
      if (life[i] > 0) continue;
      alive--;
      if (i !== alive) {
        life[i] = life[alive];
        life[alive] = 0;
        const src = alive * 3;
        pos[i * 3] = pos[src];
        pos[i * 3 + 1] = pos[src + 1];
        pos[i * 3 + 2] = pos[src + 2];
        vel[i * 3] = vel[src];
        vel[i * 3 + 1] = vel[src + 1];
        vel[i * 3 + 2] = vel[src + 2];
      }
    }

    this.buffers.alive = alive;
  }
}

export type FeatureHandle = {
  id: string;
  sim?: ParticlesSim;
  disposeTick?: () => void;
  attach(app: ParticlesApp): void;
  detach(app: ParticlesApp): void;
};

const ParticlesFeature: FeatureHandle = {
  id: 'Particles.GPU.TSL',
  attach(app: ParticlesApp) {
    if (!(app.renderer instanceof WebGPURenderer)) {
      throw new Error('Particles.GPU.TSL requires a WebGPURenderer.');
    }
    this.sim = new ParticlesSim(app.renderer, applyPreset(createDefaultOptions(), 'water_flip'));
    this.sim.attach(app.scene);
    const tick = (dt: number, _elapsed: number) => this.sim?.update(dt ?? 1 / 60);
    this.disposeTick = app.onTick(tick);
  },
  detach(app: ParticlesApp) {
    if (!this.sim) return;
    if (this.disposeTick) {
      this.disposeTick();
      this.disposeTick = undefined;
    }
    this.sim.detach(app.scene);
    this.sim.dispose();
    this.sim = undefined;
  },
};

export type { ParticlesOptions } from './Particles.params';
export { createDefaultOptions, mergeOptions, validateOptions, applyPreset, PRESETS } from './Particles.params';

export default ParticlesFeature;
