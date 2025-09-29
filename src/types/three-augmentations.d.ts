declare module 'three/webgpu' {
  import { WebGLRenderer, WebGLRendererParameters } from 'three';

  export class WebGPURenderer extends WebGLRenderer {
    constructor(parameters?: WebGLRendererParameters);
    init(): Promise<void>;
    device: GPUDevice;
    isWebGPURenderer: boolean;
    compute(node: any, options?: { workgroupCount?: [number, number, number] | number[]; label?: string }): void;
  }
}

declare module 'three/src/materials/nodes/MeshPhysicalNodeMaterial.js' {
  import { MeshPhysicalMaterial, MeshPhysicalMaterialParameters } from 'three';

  export default class MeshPhysicalNodeMaterial extends MeshPhysicalMaterial {
    constructor(parameters?: MeshPhysicalMaterialParameters);
  }
}

declare module 'three/src/nodes/tsl/TSLBase.js' {
  export const storage: any;
  export const int: any;
  export const float: any;
  export const bool: any;
  export const vec2: any;
  export const vec3: any;
  export const vec4: any;
  export const ivec2: any;
  export const ivec3: any;
  export const ivec4: any;
  export const uvec2: any;
  export const uvec3: any;
  export const uvec4: any;
  export const uint: any;
  export const mat3: any;
  export const mat4: any;
  export const uniform: any;
  export const instanceIndex: any;
  export const Loop: any;
  export const If: any;
  export const Fn: any;
  export const min: any;
  export const max: any;
  export const abs: any;
  export const floor: any;
  export const ceil: any;
  export const fract: any;
  export const dot: any;
  export const length: any;
  export const normalize: any;
  export const cross: any;
  export const clamp: any;
  export const mix: any;
  export const step: any;
  export const smoothstep: any;
  export const sqrt: any;
  export const sin: any;
  export const cos: any;
  export const tan: any;
  export const atan2: any;
  export const sign: any;
  export const mod: any;
  export const atomicAdd: any;
  export const atomicMax: any;
  export const atomicMin: any;
  export const atomicAnd: any;
  export const atomicOr: any;
  export const atomicXor: any;
  export const atomicStore: any;
  export const compute: any;
  export const texture: any;
  export const sampler: any;
  export const positionLocal: any;
  export const attribute: any;
  export const cameraPosition: any;
  export const color: any;
}

declare module 'three/src/nodes/code/FunctionNode.js' {
  export const wgslFn: any;
  export const glslFn: any;
}

declare module 'three/src/materials/nodes/PointsNodeMaterial.js' {
  import { Material } from 'three';
  export default class PointsNodeMaterial extends Material {
    constructor(parameters?: any);
    isNodeMaterial: boolean;
  }
}

declare module 'three' {
  export class StorageBufferAttribute extends BufferAttribute {
    constructor(array: ArrayLike<number>, itemSize: number);
    isStorageBufferAttribute: boolean;
  }

  export class NodeMaterial extends Material {
    constructor();
    isNodeMaterial: boolean;
  }
}
