import { ParticlesOptions } from './Particles.params';

export type ParticleArrays = {
  position: Float32Array;
  velocity: Float32Array;
  affine: Float32Array;
  deformation: Float32Array;
  mass: Float32Array;
  material: Float32Array;
  life: Float32Array;
};

export type ParticlesBufferBundle = {
  particles: ParticleArrays;
  maxParticles: number;
  alive: number;
};

export class ParticlesBufferAllocator {
  readonly opts: Required<ParticlesOptions>;
  readonly bundle: ParticlesBufferBundle;

  constructor(opts: Required<ParticlesOptions>) {
    this.opts = opts;
    this.bundle = this.allocate();
  }

  private allocate(): ParticlesBufferBundle {
    const max = this.opts.counts.maxParticles;
    const particles: ParticleArrays = {
      position: new Float32Array(max * 3),
      velocity: new Float32Array(max * 3),
      affine: new Float32Array(max * 9),
      deformation: new Float32Array(max * 9),
      mass: new Float32Array(max),
      material: new Float32Array(max * 4),
      life: new Float32Array(max),
    };

    return { particles, maxParticles: max, alive: 0 };
  }

  reset(): void {
    const { particles } = this.bundle;
    particles.position.fill(0);
    particles.velocity.fill(0);
    particles.affine.fill(0);
    particles.deformation.fill(0);
    particles.mass.fill(0);
    particles.material.fill(0);
    particles.life.fill(0);
    this.bundle.alive = 0;
  }

  dispose(): void {
    this.reset();
  }
}
