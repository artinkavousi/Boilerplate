declare module 'three/webgpu' {
  import { WebGLRenderer, WebGLRendererParameters } from 'three';

  export class WebGPURenderer extends WebGLRenderer {
    constructor(parameters?: WebGLRendererParameters);
    static isAvailable(): boolean;
    init(): Promise<void>;
  }
}

declare module 'three/src/materials/nodes/MeshPhysicalNodeMaterial.js' {
  import { MeshPhysicalMaterial, MeshPhysicalMaterialParameters } from 'three';

  export default class MeshPhysicalNodeMaterial extends MeshPhysicalMaterial {
    constructor(parameters?: MeshPhysicalMaterialParameters);
  }
}
