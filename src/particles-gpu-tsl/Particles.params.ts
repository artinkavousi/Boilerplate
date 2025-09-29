import * as THREE from 'three';

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

export type ParticlesRuntime = ReturnType<typeof createDefaultOptions>;

const DEFAULT_COUNTS = { maxParticles: 200_000, particlesPerTile: 64 } as const;
const DEFAULT_GRID = { dx: 0.02, res: [96, 96, 96] as [number, number, number], activeTiles: true };
const DEFAULT_TIME = { substeps: 2, cfl: 4.0, dtMax: 1 / 60 };
const DEFAULT_GRAVITY: [number, number, number] = [0, -9.81, 0];
const DEFAULT_WIND: [number, number, number] = [0, 0, 0];
const DEFAULT_FLIP = {
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
};
const DEFAULT_MPM = {
  model: 'neoHookean' as const,
  E: 50_000,
  nu: 0.33,
  yield: 0,
  hardening: 0,
  frictionDeg: 20,
  cohesion: 0,
  detClamp: [0.2, 5.0] as [number, number],
  apicBlend: 0.5,
};
const DEFAULT_XPBD = {
  iters: 4,
  compliance: { contact: 1e-6, volume: 1e-7 },
  friction: 0.4,
  restitution: 0.0,
  stabilize: true,
  shock: 0.0,
};
const DEFAULT_EMIT = {
  type: 'sphere' as const,
  rate: 5_000,
  center: [0, 0.5, 0] as [number, number, number],
  radius: 0.2,
  half: [0.2, 0.2, 0.2] as [number, number, number],
  speed: 1,
  jitter: 0.1,
};
const DEFAULT_RENDER = {
  size: 0.025,
  color: '#4dc9ff',
  additive: false,
  opacity: 1.0,
  impostor: false,
  thicknessCue: true,
};

const DEFAULT_OPTIONS: Required<ParticlesOptions> = {
  mode: 'flip',
  counts: { ...DEFAULT_COUNTS },
  grid: { ...DEFAULT_GRID },
  time: { ...DEFAULT_TIME },
  gravity: [...DEFAULT_GRAVITY],
  wind: [...DEFAULT_WIND],
  flip: { ...DEFAULT_FLIP },
  mpm: { ...DEFAULT_MPM },
  xpbd: { ...DEFAULT_XPBD },
  emit: { ...DEFAULT_EMIT },
  render: { ...DEFAULT_RENDER },
  colliders: [],
};

export function createDefaultOptions(): Required<ParticlesOptions> {
  const out: Required<ParticlesOptions> = {
    mode: DEFAULT_OPTIONS.mode,
    counts: { ...DEFAULT_OPTIONS.counts },
    grid: { ...DEFAULT_OPTIONS.grid },
    time: { ...DEFAULT_OPTIONS.time },
    gravity: [...DEFAULT_OPTIONS.gravity],
    wind: [...DEFAULT_OPTIONS.wind],
    flip: { ...DEFAULT_OPTIONS.flip },
    mpm: { ...DEFAULT_OPTIONS.mpm },
    xpbd: {
      iters: DEFAULT_OPTIONS.xpbd.iters,
      compliance: { ...DEFAULT_OPTIONS.xpbd.compliance },
      friction: DEFAULT_OPTIONS.xpbd.friction,
      restitution: DEFAULT_OPTIONS.xpbd.restitution,
      stabilize: DEFAULT_OPTIONS.xpbd.stabilize,
      shock: DEFAULT_OPTIONS.xpbd.shock,
    },
    emit: { ...DEFAULT_OPTIONS.emit },
    render: { ...DEFAULT_OPTIONS.render },
    colliders: [],
  };
  return out;
}

export function mergeOptions(target: Required<ParticlesOptions>, patch?: ParticlesOptions): Required<ParticlesOptions> {
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
    if (patch.xpbd.compliance) {
      const { contact, volume } = patch.xpbd.compliance;
      const complianceTarget = target.xpbd.compliance ?? (target.xpbd.compliance = { contact: 0, volume: 0 });
      if (typeof contact === 'number') complianceTarget.contact = contact;
      if (typeof volume === 'number') complianceTarget.volume = volume;
    }
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

export function validateOptions(opts: Required<ParticlesOptions>): void {
  if (opts.counts.maxParticles <= 0) throw new Error('maxParticles must be > 0');
  if ((opts.grid.dx ?? 0) <= 0) throw new Error('grid.dx must be > 0');
  const res = opts.grid.res ?? [0, 0, 0];
  const [gx, gy, gz] = res;
  if (gx * gy * gz <= 0) throw new Error('grid.res must be positive');
  const substeps = opts.time.substeps ?? 1;
  if (substeps < 1) throw new Error('time.substeps must be >= 1');
  const dtMax = opts.time.dtMax ?? 0;
  if (dtMax <= 0) throw new Error('time.dtMax must be > 0');
  if (opts.mode === 'flip') {
    const pressureIters = opts.flip.pressureIters ?? 0;
    if (pressureIters < 1) throw new Error('flip.pressureIters must be >= 1');
    const picFlip = opts.flip.picFlip ?? 0;
    if (picFlip < 0 || picFlip > 1) throw new Error('flip.picFlip must be within [0,1]');
  }
  if (opts.mode === 'mpm') {
    if ((opts.mpm.E ?? 0) <= 0) throw new Error('mpm.E must be > 0');
    const nu = opts.mpm.nu ?? 0;
    if (nu < 0 || nu >= 0.5) throw new Error('mpm.nu must be within [0,0.5)');
  }
}

export function cloneOptions(opts: Required<ParticlesOptions>): Required<ParticlesOptions> {
  return mergeOptions(createDefaultOptions(), opts);
}

type Preset = Partial<ParticlesOptions>;

export const PRESETS: Record<string, Preset> = {
  water_flip: {
    mode: 'flip',
    flip: { picFlip: 0.05, pressureIters: 64, pressureTol: 1e-3, surface: 0.2, viscosity: 0.01 },
    render: { color: '#3aa7ff', size: 0.02 },
    xpbd: { compliance: { contact: 5e-7 }, friction: 0.0, restitution: 0.1 },
  },
  sheet_flip: {
    mode: 'flip',
    flip: { picFlip: 0.0, pressureIters: 48, vorticity: 2.0 },
    render: { color: '#8ce0ff', size: 0.018 },
  },
  jelly_mpm: {
    mode: 'mpm',
    mpm: { model: 'neoHookean', E: 6_000, nu: 0.3, apicBlend: 0.8 },
    xpbd: { compliance: { volume: 1e-6 } },
    render: { color: '#ff7bd8', size: 0.028 },
  },
  sand_mpm: {
    mode: 'mpm',
    mpm: { model: 'druckerPrager', E: 45_000, nu: 0.2, yield: 90_000, hardening: 2.0, frictionDeg: 35 },
    xpbd: { friction: 0.6, compliance: { contact: 2e-6 } },
    render: { color: '#f0c27b', size: 0.024 },
  },
  slime_mpm: {
    mode: 'mpm',
    mpm: { model: 'bingham', E: 1_200, nu: 0.47, yield: 2_000, hardening: 0.5, frictionDeg: 10 },
    xpbd: { friction: 0.2, compliance: { contact: 1e-5 } },
    render: { color: '#a3ff7f', size: 0.03 },
  },
};

export function getPreset(name: keyof typeof PRESETS): Preset {
  return PRESETS[name];
}

export function applyPreset(opts: Required<ParticlesOptions>, name: keyof typeof PRESETS): Required<ParticlesOptions> {
  return mergeOptions(opts, PRESETS[name]);
}

export type SimStats = {
  fps: number;
  dt: number;
  gpuMs?: number;
  alive: number;
  divergence?: number;
  pressureResidual?: number;
};

export function colorToLinear(color: string): THREE.Color {
  const c = new THREE.Color(color);
  c.convertSRGBToLinear();
  return c;
}

