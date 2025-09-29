/**
 * # Particles.GPU.TSL
 *
 * WebGPU-only particle simulation module built for Three.js r180+ with the TSL NodeSystem.
 *
 * ## Install
 * ```bash
 * npm install three@^0.180.0
 * ```
 *
 * ## Import & create
 * ```ts
 * import { ParticlesSim } from './particles-gpu-tsl/Particles.index';
 * const sim = new ParticlesSim(webgpuRenderer, { mode: 'flip' });
 * sim.attach(scene);
 * ```
 *
 * ## Hot-swap feature
 * Use the default export `Particles.GPU.TSL` to attach/detach from a host app implementing `{ scene, renderer, onTick, offTick }`.
 *
 * ## Live params
 * `sim.setParams({...})` reconfigures the simulation; presets exported from `Particles.params` help bootstrap.
 *
 * ## Usage snippets
 * FLIP water:
 * ```ts
 * sim.setParams({ mode: 'flip', flip: { picFlip: 0.05, pressureIters: 60 } });
 * ```
 * MPM jelly:
 * ```ts
 * sim.setParams({ mode: 'mpm', mpm: { model: 'neoHookean', E: 6000, nu: 0.3 }, xpbd: { compliance: { volume: 1e-6 } } });
 * ```
 */

import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { mergeOptions, createDefaultOptions, validateOptions, ParticlesOptions, SimStats, PRESETS, getPreset } from './Particles.params';
import { ParticlesBufferAllocator, ParticlesBufferBundle } from './Particles.buffers';
import { ParticlesRenderer } from './Particles.renderer';
import { ParticlesGraph } from './Particles.graph';

export type ParticlesApp = {
  scene: THREE.Scene;
  renderer: WebGPURenderer;
  onTick: (fn: (dt: number, elapsed?: number) => void) => (() => void) | void;
  offTick?: (fn: (dt: number) => void) => void;
  ui?: { section(label: string): { addInput(target: any, key: string, options?: any): void } };
};

export class ParticlesSim {
  readonly renderer: WebGPURenderer;
  readonly device: GPUDevice;
  readonly options: Required<ParticlesOptions>;
  readonly allocator: ParticlesBufferAllocator;
  readonly buffers: ParticlesBufferBundle;
  readonly particlesRenderer: ParticlesRenderer;
  graph: ParticlesGraph;

  private stats: SimStats = { fps: 0, dt: 0, alive: 0 };
  public tickHandler?: (dt: number) => void;

  constructor(renderer: WebGPURenderer, opts?: ParticlesOptions) {
    if (!renderer) throw new Error('ParticlesSim requires a WebGPURenderer instance');
    if (!(renderer as any).isWebGPURenderer) throw new Error('ParticlesSim requires Three.js WebGPURenderer');
    if (!('compute' in renderer)) throw new Error('WebGPURenderer is missing compute node support (TSL)');

    const device = (renderer as any).device as GPUDevice;
    if (!device) throw new Error('WebGPURenderer has no GPUDevice (ensure WebGPU is enabled)');

    const options = mergeOptions(createDefaultOptions(), opts);
    validateOptions(options);

    this.renderer = renderer;
    this.device = device;
    this.options = options;
    this.allocator = new ParticlesBufferAllocator(device, options);
    this.buffers = this.allocator.bundle;
    this.particlesRenderer = new ParticlesRenderer(this.buffers, options);
    this.graph = new ParticlesGraph(renderer, this.buffers, options);
  }

  attach(scene: THREE.Scene): void {
    if (!scene) throw new Error('attach(scene) requires a THREE.Scene');
    scene.add(this.particlesRenderer.points);
  }

  update(dt: number): void {
    const capped = Math.min(dt, this.options.time.dtMax ?? dt);
    const step = capped / (this.options.time.substeps || 1);
    for (let i = 0; i < (this.options.time.substeps || 1); i++) {
      this.graph.execute();
    }
    this.stats.dt = step;
    this.stats.fps = 1.0 / Math.max(step, 1e-5);
    this.stats.alive = this.options.counts.maxParticles;
  }

  setParams(patch: Partial<ParticlesOptions>): void {
    mergeOptions(this.options, patch);
    validateOptions(this.options);
    this.rebuild();
  }

  getStats(): SimStats {
    return { ...this.stats };
  }

  dispose(): void {
    this.particlesRenderer.dispose();
    this.allocator.dispose();
  }

  private rebuild(): void {
    this.graph = new ParticlesGraph(this.renderer, this.buffers, this.options);
    this.particlesRenderer.setMaxParticles(this.options.counts.maxParticles);
  }
}

export type FeatureHandle = {
  id: string;
  sim?: ParticlesSim;
  tickDisposer?: () => void;
  attach(app: ParticlesApp): Promise<void> | void;
  detach?(app: ParticlesApp): void;
};

const ParticlesFeature: FeatureHandle = {
  id: 'Particles.GPU.TSL',
  sim: undefined,
  tickDisposer: undefined,
  attach(app: ParticlesApp) {
    if (!app.renderer) throw new Error('Particles.GPU.TSL requires app.renderer (Three.WebGPURenderer)');
    this.sim = new ParticlesSim(app.renderer, {});
    this.sim.attach(app.scene);
    const tick = (dt: number) => this.sim?.update(dt ?? 1 / 60);
    this.sim.tickHandler = tick;
    const disposer = app.onTick(tick);
    if (typeof disposer === 'function') {
      this.tickDisposer = disposer;
    }
  },
  detach(app: ParticlesApp) {
    if (!this.sim) return;
    if (this.tickDisposer) {
      this.tickDisposer();
    } else if (app.offTick && this.sim.tickHandler) {
      app.offTick(this.sim.tickHandler);
    }
    this.sim.dispose();
    app.scene.remove(this.sim.particlesRenderer.points);
    this.sim = undefined;
    this.tickDisposer = undefined;
  },
};

export default ParticlesFeature;

/**
 * Convas Feature Adapter
 * Wraps ParticlesFeature to work with the Convas Feature interface
 */
export function createParticlesFeature(options?: ParticlesOptions) {
  return {
    id: 'Particles.GPU.TSL',
    sim: undefined as ParticlesSim | undefined,
    tickDisposer: undefined as (() => void) | undefined,
    
    async attach(app: any) {
      if (!app.renderer) throw new Error('Particles requires renderer');
      if (!(app.renderer as any).isWebGPURenderer) {
        throw new Error('Particles requires WebGPU renderer. Enable WebGPU in config.');
      }
      
      this.sim = new ParticlesSim(app.renderer, options);
      this.sim.attach(app.stage.scene);
      
      const tick = (dt: number) => this.sim?.update(dt ?? 1 / 60);
      this.tickDisposer = app.onTick(tick);
    },
    
    detach(app: any) {
      if (!this.sim) return;
      if (this.tickDisposer) this.tickDisposer();
      this.sim.dispose();
      app.stage.scene.remove(this.sim.particlesRenderer.points);
      this.sim = undefined;
      this.tickDisposer = undefined;
    }
  };
}

// Re-export types and utilities
export type { ParticlesOptions, SimStats, Mode } from './Particles.params';
export { PRESETS, getPreset, applyPreset, colorToLinear } from './Particles.params';
