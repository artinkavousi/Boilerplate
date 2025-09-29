import * as THREE from 'three';
import { FlipPass, MpmPass } from './Particles.backends';
import { XpbdPass } from './Particles.contacts';
import { ParticlesBufferBundle } from './Particles.buffers';
import { ParticlesOptions } from './Particles.params';

export type PassRecord = {
  name: string;
  run: () => void;
};

export class ParticlesGraph {
  readonly passes: PassRecord[] = [];
  readonly backend: FlipPass | MpmPass;
  readonly xpbd?: XpbdPass;

  constructor(
    readonly renderer: THREE.WebGPURenderer,
    readonly bundle: ParticlesBufferBundle,
    readonly opts: Required<ParticlesOptions>,
  ) {
    const device = renderer.device as unknown as GPUDevice;
    if (!device) throw new Error('ParticlesGraph requires WebGPURenderer with GPU device');

    this.backend = opts.mode === 'flip' ? new FlipPass(bundle, opts) : new MpmPass(bundle, opts);
    this.backend.passes.forEach((pass) => {
      this.passes.push({
        name: pass.name,
        run: () => {
          const workgroup = typeof pass.dispatch === 'function' ? pass.dispatch() : pass.dispatch;
          renderer.compute(pass.node, { workgroupCount: workgroup, label: pass.name });
        },
      });
    });

    if (opts.xpbd.iters && opts.xpbd.iters > 0) {
      this.xpbd = new XpbdPass(bundle, opts);
      for (let i = 0; i < opts.xpbd.iters; i++) {
        this.xpbd.passes.forEach((pass) => {
          this.passes.push({
            name: `${pass.name}#${i}`,
            run: () => renderer.compute(pass.node, { workgroupCount: [Math.ceil(opts.counts.maxParticles / 128), 1, 1], label: pass.name }),
          });
        });
      }
    }
  }

  execute(): void {
    for (const pass of this.passes) pass.run();
  }
}

