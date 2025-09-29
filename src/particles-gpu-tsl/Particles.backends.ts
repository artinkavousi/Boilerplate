import { ParticlesBufferBundle } from './Particles.buffers';
import { ParticlesOptions } from './Particles.params';

export type RuntimeContext = {
  bundle: ParticlesBufferBundle;
  opts: Required<ParticlesOptions>;
};

export type ComputePass = {
  name: string;
  run: (dt: number, ctx: RuntimeContext) => void;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export class FlipPass {
  readonly passes: ComputePass[];

  constructor() {
    this.passes = [
      { name: 'gridClearNode', run: () => void 0 },
      { name: 'p2gApicNode', run: flipIntegrateVelocity },
      { name: 'gridForcesNode', run: flipApplyForces },
      { name: 'pressureSolveNode', run: flipViscosity },
      { name: 'gridProjectNode', run: () => void 0 },
      { name: 'g2pApicNode', run: integratePositions },
      { name: 'reseedCompactNode', run: () => void 0 },
      { name: 'collideSdfGridNode', run: () => void 0 },
    ];
  }
}

export class MpmPass {
  readonly passes: ComputePass[];

  constructor() {
    this.passes = [
      { name: 'gridClearNode', run: () => void 0 },
      { name: 'mpmP2gNode', run: mpmStressIntegrate },
      { name: 'mpmPlasticityNode', run: mpmPlasticity },
      { name: 'gridUpdateCflNode', run: () => void 0 },
      { name: 'mpmG2pApicNode', run: integratePositions },
      { name: 'collideSdfGridNode', run: () => void 0 },
    ];
  }
}

function flipIntegrateVelocity(dt: number, ctx: RuntimeContext): void {
  const { bundle, opts } = ctx;
  const { position, velocity } = bundle.particles;
  const alive = bundle.alive;
  const gravity = opts.gravity;
  const wind = opts.wind;
  const vorticity = opts.flip.vorticity ?? 0;
  const viscosity = opts.flip.viscosity ?? 0;
  const picFlip = opts.flip.picFlip ?? 0.05;

  for (let i = 0; i < alive; i++) {
    const base = i * 3;
    const px = position[base];
    const py = position[base + 1];
    const pz = position[base + 2];

    let vx = velocity[base];
    let vy = velocity[base + 1];
    let vz = velocity[base + 2];

    vx += (gravity[0] + wind[0]) * dt;
    vy += (gravity[1] + wind[1]) * dt;
    vz += (gravity[2] + wind[2]) * dt;

    if (vorticity !== 0) {
      const curl = Math.sin(pz * 2) - Math.cos(px * 1.5);
      vx += curl * vorticity * dt * 0.2;
      vz -= curl * vorticity * dt * 0.2;
    }

    if (viscosity > 0) {
      const damp = Math.exp(-viscosity * dt);
      vx *= damp;
      vy *= damp;
      vz *= damp;
    }

    velocity[base] = lerp(vx, velocity[base], picFlip);
    velocity[base + 1] = lerp(vy, velocity[base + 1], picFlip);
    velocity[base + 2] = lerp(vz, velocity[base + 2], picFlip);
  }
}

function flipApplyForces(dt: number, ctx: RuntimeContext): void {
  const { bundle, opts } = ctx;
  const { velocity } = bundle.particles;
  const alive = bundle.alive;

  const surface = opts.flip.surface ?? 0;
  const cohesion = opts.flip.cohesion ?? 0;

  if (surface === 0 && cohesion === 0) return;

  for (let i = 0; i < alive; i++) {
    const base = i * 3;
    const vx = velocity[base];
    const vy = velocity[base + 1];
    const vz = velocity[base + 2];

    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-5;
    const shrink = Math.exp(-surface * dt);
    const stick = Math.exp(-cohesion * dt);

    velocity[base] = vx * shrink;
    velocity[base + 1] = vy * stick;
    velocity[base + 2] = vz * shrink;

    const limit = opts.time.cfl ?? 4;
    const maxSpeed = limit * dt * 10;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      velocity[base] *= scale;
      velocity[base + 1] *= scale;
      velocity[base + 2] *= scale;
    }
  }
}

function flipViscosity(dt: number, ctx: RuntimeContext): void {
  const damping = ctx.opts.flip.viscosity ?? 0;
  if (damping <= 0) return;
  const { velocity } = ctx.bundle.particles;
  const alive = ctx.bundle.alive;
  const decay = Math.exp(-damping * dt * 0.5);
  for (let i = 0; i < alive; i++) {
    const base = i * 3;
    velocity[base] *= decay;
    velocity[base + 1] *= decay;
    velocity[base + 2] *= decay;
  }
}

function mpmStressIntegrate(dt: number, ctx: RuntimeContext): void {
  const { bundle, opts } = ctx;
  const alive = bundle.alive;
  const { position, velocity, deformation } = bundle.particles;
  const gravity = opts.gravity;
  const blend = clamp(opts.mpm.apicBlend ?? 0.5, 0, 1);

  for (let i = 0; i < alive; i++) {
    const base = i * 3;
    const px = position[base];
    const py = position[base + 1];
    const pz = position[base + 2];

    let vx = velocity[base];
    let vy = velocity[base + 1];
    let vz = velocity[base + 2];

    vx += gravity[0] * dt;
    vy += gravity[1] * dt;
    vz += gravity[2] * dt;

    const dx = Math.sin(px * 1.7 + pz * 0.5);
    const dz = Math.cos(pz * 1.4 - px * 0.3);
    vx = lerp(vx, dx * 2.0, blend * 0.25);
    vz = lerp(vz, dz * 2.0, blend * 0.25);

    const base9 = i * 9;
    deformation[base9] = lerp(deformation[base9], 1 + vx * 0.1, 0.1);
    deformation[base9 + 4] = lerp(deformation[base9 + 4], 1 + vy * 0.1, 0.1);
    deformation[base9 + 8] = lerp(deformation[base9 + 8], 1 + vz * 0.1, 0.1);

    velocity[base] = vx;
    velocity[base + 1] = vy;
    velocity[base + 2] = vz;
  }
}

function mpmPlasticity(dt: number, ctx: RuntimeContext): void {
  const { bundle, opts } = ctx;
  const alive = bundle.alive;
  const { velocity } = bundle.particles;
  const yieldStrength = opts.mpm.yield ?? 0;
  const hardening = opts.mpm.hardening ?? 0;

  if (yieldStrength <= 0 && hardening <= 0) return;

  const maxSpeed = 6 + yieldStrength * 1e-5;
  const stiffness = 1 + hardening * 0.1;

  for (let i = 0; i < alive; i++) {
    const base = i * 3;
    let vx = velocity[base];
    let vy = velocity[base + 1];
    let vz = velocity[base + 2];

    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz) + 1e-6;
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      vx *= scale;
      vy *= scale;
      vz *= scale;
    }

    vx /= stiffness;
    vy /= stiffness;
    vz /= stiffness;

    velocity[base] = vx;
    velocity[base + 1] = vy;
    velocity[base + 2] = vz;
  }
}

function integratePositions(dt: number, ctx: RuntimeContext): void {
  const { bundle, opts } = ctx;
  const alive = bundle.alive;
  const { position, velocity } = bundle.particles;
  const cfl = opts.time.cfl ?? 4;
  const maxSpeed = cfl * (opts.grid.dx ?? 0.02) / Math.max(dt, 1e-4);

  for (let i = 0; i < alive; i++) {
    const base = i * 3;
    let vx = velocity[base];
    let vy = velocity[base + 1];
    let vz = velocity[base + 2];

    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      vx *= scale;
      vy *= scale;
      vz *= scale;
      velocity[base] = vx;
      velocity[base + 1] = vy;
      velocity[base + 2] = vz;
    }

    position[base] += vx * dt;
    position[base + 1] += vy * dt;
    position[base + 2] += vz * dt;
  }
}
