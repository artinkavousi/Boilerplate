import * as THREE from 'three';
import {
  wgslFn,
  storage,
  uniform,
  uint,
  vec3,
  float,
  compute,
  PointsNodeMaterial,
  color,
  clamp,
  smoothstep,
  cameraPosition,
  positionLocal,
  attribute,
} from 'three/examples/jsm/nodes/Nodes.js';

export type Mode = 'flip' | 'mpm';

export type ParticlesOptions = {
  mode?: Mode;
  counts?: { maxParticles: number; particlesPerTile?: number };
  grid?: { dx?: number; res?: [number, number, number]; activeTiles?: boolean };
  time?: { substeps?: number; cfl?: number; dtMax?: number };
  gravity?: [number, number, number];
  wind?: [number, number, number];
  flip?: {
    picFlip?: number;
    apic?: boolean;
    pressureIters?: number;
    pressureTol?: number;
    warmStart?: boolean;
    vorticity?: number;
    viscosity?: number;
    surface?: number;
    cohesion?: number;
    reseed?: [number, number];
  };
  mpm?: {
    model?: 'neoHookean' | 'corotated' | 'druckerPrager' | 'bingham';
    E?: number;
    nu?: number;
    yield?: number;
    hardening?: number;
    frictionDeg?: number;
    cohesion?: number;
    detClamp?: [number, number];
    apicBlend?: number;
  };
  xpbd?: {
    iters?: number;
    compliance?: { contact?: number; volume?: number };
    friction?: number;
    restitution?: number;
    stabilize?: boolean;
    shock?: number;
  };
  emit?: {
    type: 'sphere' | 'box' | 'mesh';
    rate: number;
    center?: [number, number, number];
    radius?: number;
    half?: [number, number, number];
    speed?: number;
    jitter?: number;
  };
  render?: {
    size?: number;
    color?: string;
    additive?: boolean;
    opacity?: number;
    impostor?: boolean;
    thicknessCue?: boolean;
  };
  colliders?: Array<{
    kind: 'plane' | 'sphere' | 'box' | 'capsule' | 'sdf3d';
    params: any;
    friction?: number;
    restitution?: number;
    thickness?: number;
    sticky?: number;
    twoWay?: boolean;
  }>;
};

export type SimStats = {
  fps: number;
  dt: number;
  gpuMs?: number;
  alive: number;
  divergence?: number;
  pressureResidual?: number;
};

const DEFAULT_OPTIONS = {
  mode: 'flip' as Mode,
  counts: { maxParticles: 200_000, particlesPerTile: 64 },
  grid: { dx: 0.02, res: [96, 96, 96] as [number, number, number], activeTiles: true },
  time: { substeps: 2, cfl: 4.0, dtMax: 1 / 60 },
  gravity: [0, -9.81, 0] as [number, number, number],
  wind: [0, 0, 0] as [number, number, number],
  flip: {
    picFlip: 0.05,
    apic: true,
    pressureIters: 60,
    pressureTol: 1e-3,
    warmStart: true,
    vorticity: 0,
    viscosity: 0,
    surface: 0,
    cohesion: 0,
    reseed: [0.4, 0.6] as [number, number],
  },
  mpm: {
    model: 'neoHookean' as const,
    E: 50_000,
    nu: 0.33,
    yield: 0,
    hardening: 0,
    frictionDeg: 20,
    cohesion: 0,
    detClamp: [0.2, 5.0] as [number, number],
    apicBlend: 0.5,
  },
  xpbd: {
    iters: 4,
    compliance: { contact: 1e-6, volume: 1e-7 },
    friction: 0.4,
    restitution: 0,
    stabilize: true,
    shock: 0,
  },
  emit: {
    type: 'sphere' as const,
    rate: 5_000,
    center: [0, 0.5, 0] as [number, number, number],
    radius: 0.2,
    half: [0.2, 0.2, 0.2] as [number, number, number],
    speed: 1,
    jitter: 0.1,
  },
  render: {
    size: 0.025,
    color: '#4dc9ff',
    additive: false,
    opacity: 1,
    impostor: false,
    thicknessCue: true,
  },
  colliders: [] as ParticlesOptions['colliders'],
} as const satisfies Required<ParticlesOptions>;

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

function createDefaultOptions(): Required<ParticlesOptions> {
  return JSON.parse(JSON.stringify(DEFAULT_OPTIONS));
}

function mergeOptions(target: Required<ParticlesOptions>, patch?: ParticlesOptions): Required<ParticlesOptions> {
  if (!patch) return target;
  if (patch.mode) target.mode = patch.mode;
  if (patch.counts) Object.assign(target.counts, patch.counts);
  if (patch.grid) Object.assign(target.grid, patch.grid);
  if (patch.time) Object.assign(target.time, patch.time);
  if (patch.gravity) target.gravity = [...patch.gravity];
  if (patch.wind) target.wind = [...patch.wind];
  if (patch.flip) Object.assign(target.flip, patch.flip);
  if (patch.mpm) Object.assign(target.mpm, patch.mpm);
  if (patch.xpbd) {
    target.xpbd.iters = patch.xpbd.iters ?? target.xpbd.iters;
    if (patch.xpbd.compliance) Object.assign(target.xpbd.compliance, patch.xpbd.compliance);
    if (typeof patch.xpbd.friction === 'number') target.xpbd.friction = patch.xpbd.friction;
    if (typeof patch.xpbd.restitution === 'number') target.xpbd.restitution = patch.xpbd.restitution;
    if (typeof patch.xpbd.stabilize === 'boolean') target.xpbd.stabilize = patch.xpbd.stabilize;
    if (typeof patch.xpbd.shock === 'number') target.xpbd.shock = patch.xpbd.shock;
  }
  if (patch.emit) Object.assign(target.emit, patch.emit);
  if (patch.render) Object.assign(target.render, patch.render);
  if (patch.colliders) target.colliders = patch.colliders.map((c) => ({ ...c, params: { ...c.params } }));
  return target;
}

function validateOptions(opts: Required<ParticlesOptions>): void {
  if (opts.counts.maxParticles <= 0) throw new Error('maxParticles must be > 0');
  if (opts.grid.dx! <= 0) throw new Error('grid.dx must be > 0');
}

export function colorToLinear(colorHex: string): THREE.Color {
  const c = new THREE.Color(colorHex);
  c.convertSRGBToLinear();
  return c;
}

type BufferResource = {
  name: string;
  buffer: GPUBuffer;
  size: number;
  usage: GPUBufferUsageFlags;
};

type ParticlesBufferBundle = {
  particles: {
    Pos: BufferResource;
    Vel: BufferResource;
    C: BufferResource;
    F: BufferResource;
    Mass: BufferResource;
    MatP: BufferResource;
  };
  grid: {
    U: BufferResource;
    V: BufferResource;
    W: BufferResource;
    Mass: BufferResource;
    Pressure: BufferResource;
    Divergence: BufferResource;
    Flags: BufferResource;
  };
  hash: {
    CellStart: BufferResource;
    CellCount: BufferResource;
    Indices: BufferResource;
  };
  collider: { Ubo: THREE.DataArrayTexture | null };
  totalBytes: number;
};

class ParticlesBufferAllocator {
  readonly bundle: ParticlesBufferBundle;
  constructor(readonly device: GPUDevice, readonly opts: Required<ParticlesOptions>) {
    this.bundle = this.allocateAll();
  }
  private allocateAll(): ParticlesBufferBundle {
    const { counts, grid } = this.opts;
    const particleStride = 16 * 8;
    const particleBytes = counts.maxParticles * particleStride;
    const gridCells = grid.res[0] * grid.res[1] * grid.res[2];
    const gridStride = 16 * 4;
    const gridBytes = gridCells * gridStride;
    const hashBytes = gridCells * 16;
    const create = (name: string, size: number) => {
      const padded = Math.ceil(size / 256) * 256;
      const buffer = this.device.createBuffer({ size: padded, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: name });
      return { name, buffer, size: padded, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST };
    };
    return {
      particles: {
        Pos: create('SSBO.Pos', particleBytes),
        Vel: create('SSBO.Vel', particleBytes),
        C: create('SSBO.C', particleBytes),
        F: create('SSBO.F', particleBytes),
        Mass: create('SSBO.Mass', particleBytes),
        MatP: create('SSBO.MatP', particleBytes),
      },
      grid: {
        U: create('Grid.U', gridBytes),
        V: create('Grid.V', gridBytes),
        W: create('Grid.W', gridBytes),
        Mass: create('Grid.Mass', gridBytes),
        Pressure: create('Grid.Pressure', gridBytes),
        Divergence: create('Grid.Divergence', gridBytes),
        Flags: create('Grid.Flags', gridCells * 4),
      },
      hash: {
        CellStart: create('Hash.CellStart', hashBytes),
        CellCount: create('Hash.CellCount', hashBytes),
        Indices: create('Hash.Indices', hashBytes),
      },
      collider: { Ubo: null },
      totalBytes: particleBytes * 6 + gridBytes * 6 + hashBytes * 3,
    };
  }
  dispose(): void {
    Object.values(this.bundle.particles).forEach((r) => r.buffer.destroy());
    Object.values(this.bundle.grid).forEach((r) => r.buffer.destroy());
    Object.values(this.bundle.hash).forEach((r) => r.buffer.destroy());
  }
}

class ParticlesRenderer {
  readonly geometry = new THREE.BufferGeometry();
  readonly material = new PointsNodeMaterial();
  readonly points: THREE.Points;
  constructor(readonly bundle: ParticlesBufferBundle, readonly opts: Required<ParticlesOptions>) {
    this.geometry.setDrawRange(0, opts.counts.maxParticles);
    const uniforms = uniform({
      pointSize: float(opts.render.size ?? 0.02),
      opacity: float(opts.render.opacity ?? 1),
      additive: float(opts.render.additive ? 1 : 0),
      color: color(colorToLinear(opts.render.color ?? '#ffffff')),
    });
    const posSSBO = storage(bundle.particles.Pos.buffer, 'vec4<f32>');
    this.material.positionNode = vec3(posSSBO.xyz);
    const viewDir = vec3(cameraPosition).sub(positionLocal);
    const dist = viewDir.length();
    this.material.sizeNode = uniforms.pointSize.mul(clamp(float(1).div(dist), 0, 1)).mul(float(300));
    this.material.colorNode = uniforms.color;
    this.material.alphaNode = uniforms.opacity.mul(smoothstep(float(0.5), float(0.46), attribute('uv', 'vec2')));
    this.material.transparent = true;
    this.material.depthWrite = !opts.render.additive;
    this.material.blending = opts.render.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    const attributeBuffer = new THREE.StorageBufferAttribute(bundle.particles.Pos.buffer as unknown as GPUBuffer, 4, 'float32');
    this.material.setAttribute('position', attributeBuffer);
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }
  setMaxParticles(count: number) {
    this.geometry.setDrawRange(0, count);
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

type ComputePass = {
  name: string;
  node: any;
  dispatch: [number, number, number] | (() => [number, number, number]);
};

class FlipPass {
  readonly passes: ComputePass[];
  constructor(readonly bundle: ParticlesBufferBundle, readonly opts: Required<ParticlesOptions>) {
    this.passes = this.create();
  }
  private create(): ComputePass[] {
    const dispatchParticles = () => [Math.ceil(this.opts.counts.maxParticles / 128), 1, 1] as [number, number, number];
    const dispatchGrid = () => {
      const total = this.opts.grid.res[0] * this.opts.grid.res[1] * this.opts.grid.res[2];
      return [Math.ceil(total / 128), 1, 1] as [number, number, number];
    };
    const simUniform = uniform({
      gridRes: vec3(this.opts.grid.res[0], this.opts.grid.res[1], this.opts.grid.res[2]),
      dx: float(this.opts.grid.dx ?? 0.02),
      numParticles: uint(this.opts.counts.maxParticles),
      dt: float(this.opts.time.dtMax ?? 1 / 60),
      picFlip: float(this.opts.flip.picFlip ?? 0.05),
    });
    const particles = {
      Pos: storage(this.bundle.particles.Pos.buffer, 'vec4<f32>'),
      Vel: storage(this.bundle.particles.Vel.buffer, 'vec4<f32>'),
      Mass: storage(this.bundle.particles.Mass.buffer, 'vec4<f32>'),
    };
    const grid = {
      U: storage(this.bundle.grid.U.buffer, 'vec4<f32>'),
      V: storage(this.bundle.grid.V.buffer, 'vec4<f32>'),
      W: storage(this.bundle.grid.W.buffer, 'vec4<f32>'),
      Mass: storage(this.bundle.grid.Mass.buffer, 'vec4<f32>'),
      Pressure: storage(this.bundle.grid.Pressure.buffer, 'vec4<f32>'),
      Divergence: storage(this.bundle.grid.Divergence.buffer, 'vec4<f32>'),
    };
    const gridClear = compute(wgslFn(`
      @group(0) var<uniform> Sim: struct { numParticles: u32, dt: f32, picFlip: f32, pad: f32, gridRes: vec3<f32>, dx: f32 };
      @group(1) var<storage, read_write> U: array<vec4<f32>>;
      @group(1) var<storage, read_write> V: array<vec4<f32>>;
      @group(1) var<storage, read_write> W: array<vec4<f32>>;
      @group(1) var<storage, read_write> Mass: array<vec4<f32>>;
      @group(1) var<storage, read_write> Pressure: array<vec4<f32>>;
      @group(1) var<storage, read_write> Divergence: array<vec4<f32>>;
      @compute @workgroup_size(128)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let index = gid.x;
        if (index >= u32(Sim.gridRes.x * Sim.gridRes.y * Sim.gridRes.z)) { return; }
        U[index] = vec4<f32>(0.0);
        V[index] = vec4<f32>(0.0);
        W[index] = vec4<f32>(0.0);
        Mass[index] = vec4<f32>(0.0);
        Pressure[index] = vec4<f32>(0.0);
        Divergence[index] = vec4<f32>(0.0);
      }
    `), { workgroupSize: [128, 1, 1], bindings: { Sim: simUniform, ...grid } });
    const p2g = compute(wgslFn(`
      @group(0) var<uniform> Sim: struct { numParticles: u32, dt: f32, picFlip: f32, pad: f32, gridRes: vec3<f32>, dx: f32 };
      @group(1) var<storage, read> Pos: array<vec4<f32>>;
      @group(1) var<storage, read> Vel: array<vec4<f32>>;
      @group(1) var<storage, read> Mass: array<vec4<f32>>;
      @group(2) var<storage, read_write> GridU: array<vec4<f32>>;
      @group(2) var<storage, read_write> GridV: array<vec4<f32>>;
      @group(2) var<storage, read_write> GridW: array<vec4<f32>>;
      @group(2) var<storage, read_write> GridMass: array<vec4<f32>>;
      fn indexOf(cell: vec3<u32>) -> u32 {
        return cell.x + cell.y * u32(Sim.gridRes.x) + cell.z * u32(Sim.gridRes.x * Sim.gridRes.y);
      }
      fn p2gApicNode(i: u32) {
        if (i >= Sim.numParticles) { return; }
        let pos = Pos[i].xyz;
        let vel = Vel[i].xyz;
        let cell = vec3<u32>(floor(pos / Sim.dx));
        let id = indexOf(cell);
        atomicAdd(&GridMass[id].x, 1.0);
        atomicAdd(&GridU[id].x, vel.x);
        atomicAdd(&GridV[id].x, vel.y);
        atomicAdd(&GridW[id].x, vel.z);
      }
      @compute @workgroup_size(128)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let index = gid.x;
        if (index >= Sim.numParticles) { return; }
        p2gApicNode(index);
      }
    `), { workgroupSize: [128, 1, 1], bindings: { Sim: simUniform, Pos: particles.Pos, Vel: particles.Vel, Mass: particles.Mass, GridU: grid.U, GridV: grid.V, GridW: grid.W, GridMass: grid.Mass } });
    const g2p = compute(wgslFn(`
      @group(0) var<uniform> Sim: struct { numParticles: u32, dt: f32, picFlip: f32, pad: f32, gridRes: vec3<f32>, dx: f32 };
      @group(1) var<storage, read_write> Pos: array<vec4<f32>>;
      @group(1) var<storage, read_write> Vel: array<vec4<f32>>;
      @group(2) var<storage, read> GridU: array<vec4<f32>>;
      @group(2) var<storage, read> GridV: array<vec4<f32>>;
      @group(2) var<storage, read> GridW: array<vec4<f32>>;
      @group(2) var<storage, read> GridMass: array<vec4<f32>>;
      fn indexOf(cell: vec3<u32>) -> u32 {
        return cell.x + cell.y * u32(Sim.gridRes.x) + cell.z * u32(Sim.gridRes.x * Sim.gridRes.y);
      }
      fn g2pApicNode(i: u32) {
        if (i >= Sim.numParticles) { return; }
        let pos = Pos[i];
        let cell = vec3<u32>(floor(pos.xyz / Sim.dx));
        let id = indexOf(cell);
        let invMass = select(0.0, 1.0 / GridMass[id].x, GridMass[id].x > 0.0);
        let vel = vec3<f32>(GridU[id].x, GridV[id].x, GridW[id].x) * invMass;
        let blended = mix(Vel[i].xyz, vel, Sim.picFlip);
        Vel[i] = vec4<f32>(blended, 0.0);
        Pos[i] = vec4<f32>(pos.xyz + blended * Sim.dt, 1.0);
      }
      @compute @workgroup_size(128)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        let index = gid.x;
        if (index >= Sim.numParticles) { return; }
        g2pApicNode(index);
      }
    `), { workgroupSize: [128, 1, 1], bindings: { Sim: simUniform, Pos: particles.Pos, Vel: particles.Vel, GridU: grid.U, GridV: grid.V, GridW: grid.W, GridMass: grid.Mass } });
    return [
      { name: 'gridClearNode', node: gridClear, dispatch: dispatchGrid },
      { name: 'p2gApicNode', node: p2g, dispatch: dispatchParticles },
      { name: 'g2pApicNode', node: g2p, dispatch: dispatchParticles },
    ];
  }
}

class MpmPass extends FlipPass {}

class XpbdPass {
  readonly passes: ComputePass[];
  constructor(readonly bundle: ParticlesBufferBundle, readonly opts: Required<ParticlesOptions>) {
    const dispatch = () => [Math.ceil(this.opts.counts.maxParticles / 128), 1, 1] as [number, number, number];
    const simUniform = uniform({ numParticles: uint(this.opts.counts.maxParticles), dt: float(this.opts.time.dtMax ?? 1 / 60) });
    const xpbdUniform = uniform({ complianceContact: float(this.opts.xpbd.compliance.contact ?? 1e-6) });
    const particles = {
      Pos: storage(this.bundle.particles.Pos.buffer, 'vec4<f32>'),
      Vel: storage(this.bundle.particles.Vel.buffer, 'vec4<f32>'),
    };
    const project = compute(wgslFn(`
      @group(0) var<uniform> Sim: struct { numParticles: u32, dt: f32 };
      @group(1) var<uniform> Xpbd: struct { complianceContact: f32 };
      @group(2) var<storage, read_write> Pos: array<vec4<f32>>;
      @group(2) var<storage, read_write> Vel: array<vec4<f32>>;
      fn xpbdProjectNode(i: u32) {
        if (i >= Sim.numParticles) { return; }
        let pos = Pos[i];
        if (pos.y < 0.0) {
          let penetration = -pos.y;
          pos.y += penetration * Xpbd.complianceContact;
          Pos[i] = pos;
          Vel[i].y = max(Vel[i].y, 0.0);
        }
      }
      @compute @workgroup_size(128)
      fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
        xpbdProjectNode(gid.x);
      }
    `), { workgroupSize: [128, 1, 1], bindings: { Sim: simUniform, Xpbd: xpbdUniform, Pos: particles.Pos, Vel: particles.Vel } });
    this.passes = [{ name: 'xpbdProjectNode', node: project, dispatch }];
  }
}

class ParticlesGraph {
  readonly passes: ComputePass[] = [];
  constructor(readonly renderer: THREE.WebGPURenderer, readonly bundle: ParticlesBufferBundle, readonly opts: Required<ParticlesOptions>) {
    const backend = opts.mode === 'flip' ? new FlipPass(bundle, opts) : new MpmPass(bundle, opts);
    backend.passes.forEach((pass) => {
      this.passes.push({
        name: pass.name,
        dispatch: pass.dispatch,
        node: pass.node,
      });
    });
    if (opts.xpbd.iters && opts.xpbd.iters > 0) {
      const xpbd = new XpbdPass(bundle, opts);
      for (let i = 0; i < opts.xpbd.iters; i++) {
        xpbd.passes.forEach((pass) => this.passes.push({ name: `${pass.name}#${i}`, node: pass.node, dispatch: pass.dispatch }));
      }
    }
  }
  execute() {
    for (const pass of this.passes) {
      const workgroup = typeof pass.dispatch === 'function' ? pass.dispatch() : pass.dispatch;
      (this.renderer as any).compute(pass.node, { workgroupCount: workgroup, label: pass.name });
    }
  }
}

export type ParticlesApp = {
  scene: THREE.Scene;
  renderer: THREE.WebGPURenderer;
  onTick(fn: (dt: number) => void): void;
  offTick(fn: (dt: number) => void): void;
};

export class ParticlesSim {
  readonly renderer: THREE.WebGPURenderer;
  readonly device: GPUDevice;
  readonly options: Required<ParticlesOptions>;
  readonly allocator: ParticlesBufferAllocator;
  readonly buffers: ParticlesBufferBundle;
  readonly particlesRenderer: ParticlesRenderer;
  graph: ParticlesGraph;
  public tickHandler?: (dt: number) => void;
  private stats: SimStats = { fps: 0, dt: 0, alive: 0 };
  constructor(renderer: THREE.WebGPURenderer, opts?: ParticlesOptions) {
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
  attach(scene: THREE.Scene) {
    scene.add(this.particlesRenderer.points);
  }
  update(dt: number) {
    const step = Math.min(dt, this.options.time.dtMax ?? dt);
    for (let i = 0; i < (this.options.time.substeps || 1); i++) {
      this.graph.execute();
    }
    this.stats.dt = step;
    this.stats.fps = 1 / Math.max(step, 1e-4);
    this.stats.alive = this.options.counts.maxParticles;
  }
  setParams(patch: Partial<ParticlesOptions>) {
    mergeOptions(this.options, patch);
    validateOptions(this.options);
    this.graph = new ParticlesGraph(this.renderer, this.buffers, this.options);
    this.particlesRenderer.setMaxParticles(this.options.counts.maxParticles);
  }
  getStats(): SimStats {
    return { ...this.stats };
  }
  dispose() {
    this.particlesRenderer.dispose();
    this.allocator.dispose();
  }
}

const ParticlesFeature = {
  id: 'Particles.GPU.TSL',
  sim: undefined as ParticlesSim | undefined,
  attach(app: ParticlesApp) {
    if (!app.renderer) throw new Error('Particles.GPU.TSL requires app.renderer (Three.WebGPURenderer)');
    this.sim = new ParticlesSim(app.renderer, {});
    this.sim.attach(app.scene);
    const tick = (dt: number) => this.sim?.update(dt ?? 1 / 60);
    this.sim.tickHandler = tick;
    app.onTick(tick);
  },
  detach(app: ParticlesApp) {
    if (!this.sim) return;
    if (this.sim.tickHandler) app.offTick(this.sim.tickHandler);
    this.sim.dispose();
    app.scene.remove(this.sim.particlesRenderer.points);
    this.sim = undefined;
  },
};

export default ParticlesFeature;

