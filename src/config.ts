import { ACESFilmicToneMapping, LinearSRGBColorSpace } from 'three';

type Primitive = string | number | boolean | undefined | null;

export type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends Primitive
    ? T[K]
    : T[K] extends Array<infer V>
      ? Array<PartialDeep<V>>
      : PartialDeep<T[K]>;
};

export interface RendererConfig {
  exposure: number;
  toneMapping: number;
  colorSpace: string;
  antialias: boolean;
  useWebGPU: boolean;
}

export interface CameraConfig {
  fov: number;
  near: number;
  far: number;
  position: [number, number, number];
  target: [number, number, number];
}

export interface LightConfig {
  envMapIntensity: number;
  keyIntensity: number;
  fillIntensity: number;
  rimIntensity: number;
  color: string;
}

export interface StageConfig {
  background: string;
  gridSize: number;
  gridDivisions: number;
}

export interface BloomConfig {
  strength: number;
  radius: number;
  threshold: number;
}

export interface DofConfig {
  focus: number;
  aperture: number;
  maxBlur: number;
}

export interface PostFXConfig {
  enabled: boolean;
  bloom: BloomConfig;
  dof: DofConfig;
  vignette: number;
  grain: number;
}

export interface DashboardConfig {
  expanded: boolean;
}

export interface Config {
  renderer: RendererConfig;
  camera: CameraConfig;
  lights: LightConfig;
  stage: StageConfig;
  postfx: PostFXConfig;
  dashboard: DashboardConfig;
}

export const defaultConfig: Config = {
  renderer: {
    exposure: 1.0,
    toneMapping: ACESFilmicToneMapping,
    colorSpace: LinearSRGBColorSpace,
    antialias: true,
    useWebGPU: true
  },
  camera: {
    fov: 45,
    near: 0.1,
    far: 200,
    position: [3, 2, 5],
    target: [0, 1, 0]
  },
  lights: {
    envMapIntensity: 1.5,
    keyIntensity: 2.5,
    fillIntensity: 1.1,
    rimIntensity: 1.8,
    color: '#ffffff'
  },
  stage: {
    background: '#0b0d11',
    gridSize: 20,
    gridDivisions: 40
  },
  postfx: {
    enabled: true,
    bloom: {
      strength: 0.9,
      radius: 0.45,
      threshold: 0.4
    },
    dof: {
      focus: 1.2,
      aperture: 0.025,
      maxBlur: 0.01
    },
    vignette: 0.25,
    grain: 0.35
  },
  dashboard: {
    expanded: true
  }
};

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function mergeConfig<T>(base: T, patch?: PartialDeep<T>): T {
  const result: any = clone(base);
  if (!patch) return result;
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key];
    if (value === undefined) continue;
    const baseValue = result[key];
    if (Array.isArray(baseValue) && Array.isArray(value)) {
      result[key] = value.slice();
    } else if (baseValue && typeof baseValue === 'object' && value && typeof value === 'object') {
      result[key] = mergeConfig(baseValue, value as any);
    } else {
      result[key] = value;
    }
  }
  return result;
}
