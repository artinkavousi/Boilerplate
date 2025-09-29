import { RuntimeContext } from './Particles.backends';
import { ParticlesOptions } from './Particles.params';

export type Collider = {
  kind: 'plane' | 'sphere' | 'box';
  friction: number;
  restitution: number;
  thickness: number;
  params: any;
};

export class SdfColliders {
  readonly colliders: Collider[];

  constructor(opts: Required<ParticlesOptions>) {
    this.colliders = (opts.colliders ?? [])
      .map((collider) => {
        const friction = collider.friction ?? opts.xpbd.friction ?? 0;
        const restitution = collider.restitution ?? opts.xpbd.restitution ?? 0.05;
        const thickness = collider.thickness ?? 0.01;
        if (collider.kind === 'plane' || collider.kind === 'sphere' || collider.kind === 'box') {
          return {
            kind: collider.kind,
            params: collider.params,
            friction,
            restitution,
            thickness,
          } as Collider;
        }
        return null;
      })
      .filter((c): c is Collider => Boolean(c));

    if (!this.colliders.length) {
      this.colliders.push({
        kind: 'plane',
        params: { normal: [0, 1, 0], offset: 0 },
        friction: opts.xpbd.friction ?? 0.2,
        restitution: opts.xpbd.restitution ?? 0.05,
        thickness: 0.015,
      });
    }
  }

  resolve(position: Float32Array, velocity: Float32Array, alive: number): void {
    for (let i = 0; i < alive; i++) {
      const base = i * 3;
      const p = [position[base], position[base + 1], position[base + 2]] as const;
      const v = [velocity[base], velocity[base + 1], velocity[base + 2]] as const;

      let px = p[0];
      let py = p[1];
      let pz = p[2];
      let vx = v[0];
      let vy = v[1];
      let vz = v[2];

      for (const collider of this.colliders) {
        if (collider.kind === 'plane') {
          const normal = collider.params.normal as [number, number, number];
          const offset = collider.params.offset ?? 0;
          const nx = normal[0];
          const ny = normal[1];
          const nz = normal[2];
          const dist = px * nx + py * ny + pz * nz + offset - collider.thickness;
          if (dist < 0) {
            px -= dist * nx;
            py -= dist * ny;
            pz -= dist * nz;
            const vn = vx * nx + vy * ny + vz * nz;
            const vtX = vx - vn * nx;
            const vtY = vy - vn * ny;
            const vtZ = vz - vn * nz;
            vx = vtX * (1 - collider.friction);
            vy = vtY * (1 - collider.friction);
            vz = vtZ * (1 - collider.friction);
            vx -= vn * nx * (1 + collider.restitution);
            vy -= vn * ny * (1 + collider.restitution);
            vz -= vn * nz * (1 + collider.restitution);
          }
        } else if (collider.kind === 'sphere') {
          const center = collider.params.center as [number, number, number];
          const radius = collider.params.radius ?? 1;
          const dx = px - center[0];
          const dy = py - center[1];
          const dz = pz - center[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const penetration = radius + collider.thickness - dist;
          if (penetration > 0 && dist > 1e-5) {
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;
            px += nx * penetration;
            py += ny * penetration;
            pz += nz * penetration;
            const vn = vx * nx + vy * ny + vz * nz;
            vx -= vn * nx * (1 + collider.restitution);
            vy -= vn * ny * (1 + collider.restitution);
            vz -= vn * nz * (1 + collider.restitution);
            vx *= 1 - collider.friction * 0.5;
            vy *= 1 - collider.friction * 0.5;
            vz *= 1 - collider.friction * 0.5;
          }
        } else if (collider.kind === 'box') {
          const min = collider.params.min as [number, number, number];
          const max = collider.params.max as [number, number, number];
          const nextX = clampToRange(px, min[0], max[0]);
          const nextY = clampToRange(py, min[1], max[1]);
          const nextZ = clampToRange(pz, min[2], max[2]);
          const dx = px - nextX;
          const dy = py - nextY;
          const dz = pz - nextZ;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 0 && dist <= collider.thickness) {
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;
            px = nextX + nx * collider.thickness;
            py = nextY + ny * collider.thickness;
            pz = nextZ + nz * collider.thickness;
            const vn = vx * nx + vy * ny + vz * nz;
            vx -= vn * nx * (1 + collider.restitution);
            vy -= vn * ny * (1 + collider.restitution);
            vz -= vn * nz * (1 + collider.restitution);
            vx *= 1 - collider.friction;
            vy *= 1 - collider.friction;
            vz *= 1 - collider.friction;
          }
        }
      }

      position[base] = px;
      position[base + 1] = py;
      position[base + 2] = pz;
      velocity[base] = vx;
      velocity[base + 1] = vy;
      velocity[base + 2] = vz;
    }
  }
}

export class XpbdPass {
  readonly passes = [
    { name: 'contactsBuildSdfNode', run: (_dt: number, _ctx: RuntimeContext) => void 0 },
    {
      name: 'xpbdProjectNode',
      run: (_dt: number, ctx: RuntimeContext & { contacts?: SdfColliders }) => {
        const { bundle } = ctx;
        if (!ctx.contacts) return;
        ctx.contacts.resolve(bundle.particles.position, bundle.particles.velocity, bundle.alive);
      },
    },
  ];

  constructor(readonly contacts: SdfColliders | undefined) {}

  step(dt: number, ctx: RuntimeContext): void {
    if (!this.contacts) return;
    for (const pass of this.passes) pass.run(dt, { ...ctx, contacts: this.contacts });
  }
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
