import * as THREE from 'three';
import { mergeOptions, ParticlesOptions, createDefaultOptions } from './Particles.params';

type BufferResource = {
  name: string;
  buffer: GPUBuffer;
  size: number;
  usage: GPUBufferUsageFlags;
};

type GridResources = {
  U: BufferResource;
  V: BufferResource;
  W: BufferResource;
  Mass: BufferResource;
  Pressure: BufferResource;
  Divergence: BufferResource;
  Flags: BufferResource;
};

type ParticlesResources = {
  Pos: BufferResource;
  Vel: BufferResource;
  C: BufferResource;
  F: BufferResource;
  Mass: BufferResource;
  MatP: BufferResource;
};

type HashResources = {
  CellStart: BufferResource;
  CellCount: BufferResource;
  Indices: BufferResource;
};

type ColliderResources = {
  Ubo: THREE.DataArrayTexture | null;
};

export type ParticlesBufferBundle = {
  particles: ParticlesResources;
  grid: GridResources;
  hash: HashResources;
  collider: ColliderResources;
  totalBytes: number;
};

export class ParticlesBufferAllocator {
  readonly device: GPUDevice;
  readonly opts: Required<ParticlesOptions>;
  readonly bundle: ParticlesBufferBundle;

  constructor(device: GPUDevice, opts?: ParticlesOptions) {
    if (!device) throw new Error('ParticlesBufferAllocator requires a valid GPUDevice');
    const normalized = mergeOptions(createDefaultOptions(), opts);
    this.device = device;
    this.opts = normalized;
    const bundle = this.allocateAll();
    this.bundle = bundle;
  }

  private allocateAll(): ParticlesBufferBundle {
    const { counts, grid } = this.opts;
    const particleStride = 16 * 2 + 16 * 6; // approximate, keeps 16-byte alignment
    const particleBytes = counts.maxParticles * particleStride;
    const gridCells = grid.res[0] * grid.res[1] * grid.res[2];
    const gridStride = 16 * 4;
    const gridBytes = gridCells * gridStride;
    const hashStride = 16 * 2;
    const hashBytes = gridCells * hashStride;

    const particles: ParticlesResources = {
      Pos: this.createStorage('SSBO.Pos', particleBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      Vel: this.createStorage('SSBO.Vel', particleBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      C: this.createStorage('SSBO.C', particleBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      F: this.createStorage('SSBO.F', particleBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      Mass: this.createStorage('SSBO.Mass', particleBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      MatP: this.createStorage('SSBO.MatP', particleBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
    };

    const gridBufs: GridResources = {
      U: this.createStorage('Grid.U', gridBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      V: this.createStorage('Grid.V', gridBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      W: this.createStorage('Grid.W', gridBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      Mass: this.createStorage('Grid.Mass', gridBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      Pressure: this.createStorage('Grid.Pressure', gridBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      Divergence: this.createStorage('Grid.Divergence', gridBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      Flags: this.createStorage('Grid.Flags', gridCells * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
    };

    const hash: HashResources = {
      CellStart: this.createStorage('Hash.CellStart', hashBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      CellCount: this.createStorage('Hash.CellCount', hashBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
      Indices: this.createStorage('Hash.Indices', hashBytes, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST),
    };

    return {
      particles,
      grid: gridBufs,
      hash,
      collider: { Ubo: null },
      totalBytes: particleBytes * 6 + gridBytes * 6 + hashBytes * 3,
    };
  }

  private createStorage(name: string, size: number, usage: GPUBufferUsageFlags): BufferResource {
    const align = 256;
    const padded = Math.ceil(size / align) * align;
    const buffer = this.device.createBuffer({ size: padded, usage, label: name });
    return { name, buffer, size: padded, usage };
  }

  dispose(): void {
    for (const resource of Object.values(this.bundle.particles)) {
      resource.buffer.destroy();
    }
    for (const resource of Object.values(this.bundle.grid)) {
      resource.buffer.destroy();
    }
    for (const resource of Object.values(this.bundle.hash)) {
      resource.buffer.destroy();
    }
  }
}

export function bindStorageToNodeMaterial(material: THREE.NodeMaterial, bundle: ParticlesBufferBundle): void {
  const attribute = new THREE.StorageBufferAttribute(bundle.particles.Pos.buffer as unknown as GPUBuffer, 4, 'float32');
  material.setAttribute('position', attribute);
}

