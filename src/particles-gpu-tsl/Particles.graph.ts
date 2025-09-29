import { ParticlesBufferBundle } from './Particles.buffers';
import { FlipPass, MpmPass, RuntimeContext } from './Particles.backends';
import { XpbdPass, SdfColliders } from './Particles.contacts';
import { ParticlesOptions } from './Particles.params';

export class ParticlesGraph {
  private backend: FlipPass | MpmPass;
  private xpbd?: XpbdPass;
  private contacts?: SdfColliders;
  private opts: Required<ParticlesOptions>;

  constructor(readonly bundle: ParticlesBufferBundle, opts: Required<ParticlesOptions>) {
    this.opts = opts;
    this.backend = opts.mode === 'flip' ? new FlipPass() : new MpmPass();
    if (opts.xpbd.iters && opts.xpbd.iters > 0) {
      this.contacts = new SdfColliders(opts);
      this.xpbd = new XpbdPass(this.contacts);
    }
  }

  step(dt: number): void {
    const context: RuntimeContext = { bundle: this.bundle, opts: this.opts };
    for (const pass of this.backend.passes) pass.run(dt, context);
    this.xpbd?.step(dt, context);
  }

  setOptions(opts: Required<ParticlesOptions>): void {
    const modeChanged = opts.mode !== this.opts.mode;
    this.opts = opts;
    if (modeChanged) {
      this.backend = opts.mode === 'flip' ? new FlipPass() : new MpmPass();
    }
    if (opts.xpbd.iters && opts.xpbd.iters > 0) {
      this.contacts = this.contacts ?? new SdfColliders(opts);
      this.xpbd = new XpbdPass(this.contacts);
    } else {
      this.xpbd = undefined;
    }
  }
}
