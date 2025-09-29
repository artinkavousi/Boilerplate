import { wgslFn, storage, uniform, uint, vec3, float, compute, ComputeNode } from 'three/examples/jsm/nodes/Nodes.js';
import { ParticlesBufferBundle } from './Particles.buffers';
import { ParticlesOptions } from './Particles.params';

type DispatchSize = [number, number, number];

type ComputePassDescriptor = {
  name: string;
  node: ComputeNode;
  workgroupSize: [number, number, number];
  dispatch: DispatchSize | (() => DispatchSize);
};

function calcDispatch(total: number, workgroup: number): number {
  return Math.ceil(total / workgroup);
}

function makeGridUniforms(opts: Required<ParticlesOptions>) {
  const sim = uniform({
    dt: float(1 / 60),
    substeps: uint(opts.time.substeps),
    gridRes: vec3(opts.grid.res[0], opts.grid.res[1], opts.grid.res[2]),
    dx: float(opts.grid.dx ?? 0.02),
  });
  return sim;
}

function makeParticleAccess(bundle: ParticlesBufferBundle) {
  return {
    pos: storage(bundle.particles.Pos.buffer, 'vec4<f32>', bundle.particles.Pos.name),
    vel: storage(bundle.particles.Vel.buffer, 'vec4<f32>', bundle.particles.Vel.name),
    C: storage(bundle.particles.C.buffer, 'mat3x3<f32>', bundle.particles.C.name),
    F: storage(bundle.particles.F.buffer, 'mat3x3<f32>', bundle.particles.F.name),
    mass: storage(bundle.particles.Mass.buffer, 'vec4<f32>', bundle.particles.Mass.name),
    matP: storage(bundle.particles.MatP.buffer, 'vec4<f32>', bundle.particles.MatP.name),
  } as const;
}

function createGridClearNode(bundle: ParticlesBufferBundle, opts: Required<ParticlesOptions>): ComputePassDescriptor {
  const uniforms = makeGridUniforms(opts);
  const grid = {
    U: storage(bundle.grid.U.buffer, 'vec4<f32>'),
    V: storage(bundle.grid.V.buffer, 'vec4<f32>'),
    W: storage(bundle.grid.W.buffer, 'vec4<f32>'),
    Mass: storage(bundle.grid.Mass.buffer, 'vec4<f32>'),
    Pressure: storage(bundle.grid.Pressure.buffer, 'vec4<f32>'),
    Divergence: storage(bundle.grid.Divergence.buffer, 'vec4<f32>'),
  };
  const kernel = wgslFn(`
    fn gridClear(index: u32) {
      U[index] = vec4<f32>(0.0);
      V[index] = vec4<f32>(0.0);
      W[index] = vec4<f32>(0.0);
      Mass[index] = vec4<f32>(0.0);
      Pressure[index] = vec4<f32>(0.0);
      Divergence[index] = vec4<f32>(0.0);
    }
  `);
  const node = compute(kernel, {
    bindings: { ...grid, Sim: uniforms },
    workgroupSize: [64, 1, 1],
  });
  const gridCells = opts.grid.res[0] * opts.grid.res[1] * opts.grid.res[2];
  return {
    name: 'gridClearNode',
    node,
    workgroupSize: [64, 1, 1],
    dispatch: [calcDispatch(gridCells, 64), 1, 1],
  };
}

function createP2GNode(bundle: ParticlesBufferBundle, opts: Required<ParticlesOptions>, mode: 'flip' | 'mpm'): ComputePassDescriptor {
  const particles = makeParticleAccess(bundle);
  const grid = {
    U: storage(bundle.grid.U.buffer, 'vec4<f32>'),
    V: storage(bundle.grid.V.buffer, 'vec4<f32>'),
    W: storage(bundle.grid.W.buffer, 'vec4<f32>'),
    Mass: storage(bundle.grid.Mass.buffer, 'vec4<f32>'),
  };
  const uniforms = makeGridUniforms(opts);
  const fnBody = mode === 'flip'
    ? `// FLIP/APIC p2g (Zhu & Bridson 2005)
       fn p2gApicNode(index: u32) {
         if (index >= params.numParticles) { return; }
         let x = vec3<f32>(Pos[index].xyz);
         let v = vec3<f32>(Vel[index].xyz);
         let weight = 1.0;
         let cell = vec3<u32>(floor(x / params.dx));
         let flat = cell.x + cell.y * params.gridRes.x + cell.z * params.gridRes.x * params.gridRes.y;
         atomicAdd(&Mass[flat].x, weight);
         atomicAdd(&U[flat].x, v.x);
         atomicAdd(&V[flat].x, v.y);
         atomicAdd(&W[flat].x, v.z);
       }
    `
    : `// MLS-MPM p2g (Stomakhin 2013)
       fn mpmP2gNode(index: u32) {
         if (index >= params.numParticles) { return; }
         let x = vec3<f32>(Pos[index].xyz);
         let mass = Mass[index].x;
         let vel = vec3<f32>(Vel[index].xyz);
         let cell = vec3<u32>(floor(x / params.dx));
         let flat = cell.x + cell.y * params.gridRes.x + cell.z * params.gridRes.x * params.gridRes.y;
         atomicAdd(&Mass[flat].x, mass);
         atomicAdd(&U[flat].x, vel.x * mass);
         atomicAdd(&V[flat].x, vel.y * mass);
         atomicAdd(&W[flat].x, vel.z * mass);
       }
    `;
  const kernel = wgslFn(`
    struct SimParams { gridRes: vec3<f32>, dt: f32, dx: f32, numParticles: u32 };
    @group(0) var<uniform> params: SimParams;
    @group(1) var<storage, read> Pos: array<vec4<f32>>;
    @group(1) var<storage, read> Vel: array<vec4<f32>>;
    @group(1) var<storage, read> Mass: array<vec4<f32>>;
    @group(2) var<storage, read_write> U: array<vec4<f32>>;
    @group(2) var<storage, read_write> V: array<vec4<f32>>;
    @group(2) var<storage, read_write> W: array<vec4<f32>>;
    @group(2) var<storage, read_write> MassGrid: array<vec4<f32>>;
    ${fnBody}
    @compute @workgroup_size(128)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      let index = gid.x;
      if (index >= params.numParticles) { return; }
      ${mode === 'flip' ? 'p2gApicNode(index);' : 'mpmP2gNode(index);'}
    }
  `);
  const node = compute(kernel, {
    workgroupSize: [128, 1, 1],
    bindings: { Pos: particles.pos, Vel: particles.vel, Mass: particles.mass, ...grid, Sim: uniforms },
  });
  return {
    name: mode === 'flip' ? 'p2gApicNode' : 'mpmP2gNode',
    node,
    workgroupSize: [128, 1, 1],
    dispatch: () => [calcDispatch(opts.counts.maxParticles, 128), 1, 1],
  };
}

function createGridForcesNode(bundle: ParticlesBufferBundle, opts: Required<ParticlesOptions>): ComputePassDescriptor {
  const grid = {
    U: storage(bundle.grid.U.buffer, 'vec4<f32>'),
    V: storage(bundle.grid.V.buffer, 'vec4<f32>'),
    W: storage(bundle.grid.W.buffer, 'vec4<f32>'),
    Mass: storage(bundle.grid.Mass.buffer, 'vec4<f32>'),
  };
  const uniforms = makeGridUniforms(opts);
  const kernel = wgslFn(`
    struct SimParams { gridRes: vec3<f32>, dt: f32, dx: f32, numParticles: u32, gravity: vec3<f32> };
    @group(0) var<uniform> params: SimParams;
    @group(2) var<storage, read_write> U: array<vec4<f32>>;
    @group(2) var<storage, read_write> V: array<vec4<f32>>;
    @group(2) var<storage, read_write> W: array<vec4<f32>>;
    @group(2) var<storage, read_write> MassGrid: array<vec4<f32>>;
    fn gridForcesNode(index: u32) {
      if (MassGrid[index].x <= 0.0) { return; }
      let invMass = 1.0 / MassGrid[index].x;
      U[index].x += params.gravity.x * params.dt;
      V[index].x += params.gravity.y * params.dt;
      W[index].x += params.gravity.z * params.dt;
    }
    @compute @workgroup_size(128)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      let index = gid.x;
      if (index >= params.gridRes.x * params.gridRes.y * params.gridRes.z) { return; }
      gridForcesNode(index);
    }
  `);
  const node = compute(kernel, {
    bindings: { ...grid, Sim: uniforms },
    workgroupSize: [128, 1, 1],
  });
  return {
    name: 'gridForcesNode',
    node,
    workgroupSize: [128, 1, 1],
    dispatch: () => [calcDispatch(opts.grid.res[0] * opts.grid.res[1] * opts.grid.res[2], 128), 1, 1],
  };
}

function createPressureSolveNode(bundle: ParticlesBufferBundle, opts: Required<ParticlesOptions>): ComputePassDescriptor {
  const grid = {
    Pressure: storage(bundle.grid.Pressure.buffer, 'vec4<f32>'),
    Divergence: storage(bundle.grid.Divergence.buffer, 'vec4<f32>'),
    Mass: storage(bundle.grid.Mass.buffer, 'vec4<f32>'),
  };
  const uniforms = makeGridUniforms(opts);
  const kernel = wgslFn(`
    fn pressureSolveNode(index: u32) {
      if (Mass[index].x <= 0.0) { return; }
      let div = Divergence[index].x;
      let pressure = Pressure[index].x;
      Pressure[index].x = mix(pressure, -div, 0.5);
    }
  `);
  const node = compute(kernel, {
    workgroupSize: [128, 1, 1],
    bindings: { ...grid, Sim: uniforms },
  });
  const total = opts.grid.res[0] * opts.grid.res[1] * opts.grid.res[2];
  return {
    name: 'pressureSolveNode',
    node,
    workgroupSize: [128, 1, 1],
    dispatch: () => [calcDispatch(total, 128), 1, 1],
  };
}

function createG2PNode(bundle: ParticlesBufferBundle, opts: Required<ParticlesOptions>, mode: 'flip' | 'mpm'): ComputePassDescriptor {
  const particles = makeParticleAccess(bundle);
  const grid = {
    U: storage(bundle.grid.U.buffer, 'vec4<f32>'),
    V: storage(bundle.grid.V.buffer, 'vec4<f32>'),
    W: storage(bundle.grid.W.buffer, 'vec4<f32>'),
    Mass: storage(bundle.grid.Mass.buffer, 'vec4<f32>'),
  };
  const uniforms = makeGridUniforms(opts);
  const fnName = mode === 'flip' ? 'g2pApicNode' : 'mpmG2pApicNode';
  const kernel = wgslFn(`
    struct SimParams { gridRes: vec3<f32>, dt: f32, dx: f32, numParticles: u32, picFlip: f32 };
    @group(0) var<uniform> params: SimParams;
    @group(1) var<storage, read_write> Pos: array<vec4<f32>>;
    @group(1) var<storage, read_write> Vel: array<vec4<f32>>;
    @group(2) var<storage, read> U: array<vec4<f32>>;
    @group(2) var<storage, read> V: array<vec4<f32>>;
    @group(2) var<storage, read> W: array<vec4<f32>>;
    @group(2) var<storage, read> MassGrid: array<vec4<f32>>;
    fn ${fnName}(index: u32) {
      let pos = Pos[index];
      let cell = vec3<u32>(floor(pos.xyz / params.dx));
      let flat = cell.x + cell.y * params.gridRes.x + cell.z * params.gridRes.x * params.gridRes.y;
      let invMass = select(0.0, 1.0 / MassGrid[flat].x, MassGrid[flat].x > 0.0);
      let velGrid = vec3<f32>(U[flat].x, V[flat].x, W[flat].x) * invMass;
      let newVel = mix(vec3<f32>(Vel[index].xyz), velGrid, params.picFlip);
      Vel[index] = vec4<f32>(newVel, 0.0);
      Pos[index] = vec4<f32>(pos.xyz + newVel * params.dt, 1.0);
    }
    @compute @workgroup_size(128)
    fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
      let index = gid.x;
      if (index >= params.numParticles) { return; }
      ${fnName}(index);
    }
  `);
  const node = compute(kernel, {
    bindings: { Pos: particles.pos, Vel: particles.vel, ...grid, Sim: uniforms },
    workgroupSize: [128, 1, 1],
  });
  return {
    name: fnName,
    node,
    workgroupSize: [128, 1, 1],
    dispatch: () => [calcDispatch(opts.counts.maxParticles, 128), 1, 1],
  };
}

function createReseedNode(bundle: ParticlesBufferBundle, opts: Required<ParticlesOptions>): ComputePassDescriptor {
  const particles = makeParticleAccess(bundle);
  const uniforms = makeGridUniforms(opts);
  const kernel = wgslFn(`
    fn reseedCompactNode(index: u32) {
      if (index >= params.numParticles) { return; }
      let pos = Pos[index];
      if (pos.y < -10.0) {
        Pos[index] = vec4<f32>(0.0, 1.0, 0.0, 1.0);
        Vel[index] = vec4<f32>(0.0);
      }
    }
  `);
  const node = compute(kernel, {
    bindings: { Pos: particles.pos, Vel: particles.vel, Sim: uniforms },
    workgroupSize: [128, 1, 1],
  });
  return {
    name: 'reseedCompactNode',
    node,
    workgroupSize: [128, 1, 1],
    dispatch: () => [calcDispatch(opts.counts.maxParticles, 128), 1, 1],
  };
}

export class FlipPass {
  readonly passes: ComputePassDescriptor[];

  constructor(readonly bundle: ParticlesBufferBundle, readonly opts: Required<ParticlesOptions>) {
    this.passes = [
      createGridClearNode(bundle, opts),
      createP2GNode(bundle, opts, 'flip'),
      createGridForcesNode(bundle, opts),
      createPressureSolveNode(bundle, opts),
      createG2PNode(bundle, opts, 'flip'),
      createReseedNode(bundle, opts),
    ];
  }
}

function createMpmPlasticityNode(bundle: ParticlesBufferBundle, opts: Required<ParticlesOptions>): ComputePassDescriptor {
  const particles = makeParticleAccess(bundle);
  const uniforms = makeGridUniforms(opts);
  const kernel = wgslFn(`
    fn mpmPlasticityNode(index: u32) {
      if (index >= params.numParticles) { return; }
      let Fm = F[index];
      F[index] = Fm;
    }
  `);
  const node = compute(kernel, {
    bindings: { F: particles.F, Sim: uniforms },
    workgroupSize: [128, 1, 1],
  });
  return {
    name: 'mpmPlasticityNode',
    node,
    workgroupSize: [128, 1, 1],
    dispatch: () => [calcDispatch(opts.counts.maxParticles, 128), 1, 1],
  };
}

function createGridUpdateCflNode(bundle: ParticlesBufferBundle, opts: Required<ParticlesOptions>): ComputePassDescriptor {
  const grid = {
    U: storage(bundle.grid.U.buffer, 'vec4<f32>'),
    V: storage(bundle.grid.V.buffer, 'vec4<f32>'),
    W: storage(bundle.grid.W.buffer, 'vec4<f32>'),
  };
  const uniforms = makeGridUniforms(opts);
  const kernel = wgslFn(`
    fn gridUpdateCflNode(index: u32) {
      U[index].x = clamp(U[index].x, -100.0, 100.0);
      V[index].x = clamp(V[index].x, -100.0, 100.0);
      W[index].x = clamp(W[index].x, -100.0, 100.0);
    }
  `);
  const node = compute(kernel, {
    bindings: { ...grid, Sim: uniforms },
    workgroupSize: [128, 1, 1],
  });
  return {
    name: 'gridUpdateCflNode',
    node,
    workgroupSize: [128, 1, 1],
    dispatch: () => [calcDispatch(opts.grid.res[0] * opts.grid.res[1] * opts.grid.res[2], 128), 1, 1],
  };
}

export class MpmPass {
  readonly passes: ComputePassDescriptor[];

  constructor(readonly bundle: ParticlesBufferBundle, readonly opts: Required<ParticlesOptions>) {
    this.passes = [
      createGridClearNode(bundle, opts),
      createP2GNode(bundle, opts, 'mpm'),
      createMpmPlasticityNode(bundle, opts),
      createGridUpdateCflNode(bundle, opts),
      createG2PNode(bundle, opts, 'mpm'),
    ];
  }
}

export type BackendPass = FlipPass | MpmPass;

