import * as THREE from 'three';
import { wgslFn, storage, uniform, float, compute, texture, sampler } from 'three/examples/jsm/nodes/Nodes.js';
import { ParticlesBufferBundle } from './Particles.buffers';
import { ParticlesOptions } from './Particles.params';

type ColliderConfig = Required<ParticlesOptions>['colliders'];

export class SdfColliders {
  readonly texture?: THREE.Data3DTexture;
  readonly material: THREE.MeshBasicMaterial;

  constructor(readonly colliders: ColliderConfig) {
    this.material = new THREE.MeshBasicMaterial({ visible: false });
  }

  createUniformBlock(device: GPUDevice) {
    const data = new Float32Array(16 * Math.max(1, this.colliders.length));
    this.colliders.forEach((c, i) => {
      const offset = i * 16;
      data[offset + 0] = c.kind === 'plane' ? 0 : c.kind === 'sphere' ? 1 : c.kind === 'box' ? 2 : c.kind === 'capsule' ? 3 : 4;
      data[offset + 1] = c.friction ?? 0.4;
      data[offset + 2] = c.restitution ?? 0.0;
      data[offset + 3] = c.thickness ?? 0.01;
    });
    const buffer = device.createBuffer({
      label: 'UBO.Colliders',
      size: data.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(buffer.getMappedRange()).set(data);
    buffer.unmap();
    return buffer;
  }

  dispose(): void {
    this.texture?.dispose();
    this.material.dispose();
  }
}

export class XpbdPass {
  readonly passes;

  constructor(readonly bundle: ParticlesBufferBundle, readonly opts: Required<ParticlesOptions>) {
    const simUniform = uniform({
      numParticles: opts.counts.maxParticles,
      dt: opts.time.dtMax,
    });
    const xpbdUniforms = uniform({
      complianceContact: float(opts.xpbd.compliance.contact ?? 1e-6),
      complianceVolume: float(opts.xpbd.compliance.volume ?? 1e-6),
      friction: float(opts.xpbd.friction ?? 0.4),
      restitution: float(opts.xpbd.restitution ?? 0.0),
    });
    const particles = {
      Pos: storage(bundle.particles.Pos.buffer, 'vec4<f32>'),
      Vel: storage(bundle.particles.Vel.buffer, 'vec4<f32>'),
      Mass: storage(bundle.particles.Mass.buffer, 'vec4<f32>'),
    };
    const colliderSampler = sampler({ type: 'float', dimension: '3d' });
    const colliderTex = texture({ value: new THREE.Data3DTexture(new Float32Array([0]), 1, 1, 1) });
    const contactsBuild = compute(wgslFn(`
      struct SimData { numParticles: u32, dt: f32 };
      @group(0) var<uniform> Sim: SimData;
      @group(1) var<storage, read_write> Pos: array<vec4<f32>>;
      fn contactsBuildSdfNode(index: u32) {
        if (index >= Sim.numParticles) { return; }
        let pos = Pos[index].xyz;
        // Evaluate analytic colliders (simplified plane)
        if (pos.y < 0.0) {
          Pos[index].y = max(Pos[index].y, 0.0);
        }
      }
    `), {
      workgroupSize: [128, 1, 1],
      bindings: { Pos: particles.Pos, Sim: simUniform },
    });
    const project = compute(wgslFn(`
      struct SimData { numParticles: u32, dt: f32 };
      @group(0) var<uniform> Sim: SimData;
      @group(0) var<uniform> Xpbd: struct { complianceContact: f32, complianceVolume: f32, friction: f32, restitution: f32 };
      @group(1) var<storage, read_write> Pos: array<vec4<f32>>;
      @group(1) var<storage, read_write> Vel: array<vec4<f32>>;
      @group(1) var<storage, read_write> Mass: array<vec4<f32>>;
      fn xpbdProjectNode(index: u32) {
        if (index >= Sim.numParticles) { return; }
        let pos = Pos[index];
        if (pos.y < 0.0) {
          let penetration = -pos.y;
          let impulse = penetration * Xpbd.complianceContact;
          pos.y += impulse;
          Pos[index] = pos;
          Vel[index].y = max(Vel[index].y, 0.0);
        }
      }
    `), {
      workgroupSize: [128, 1, 1],
      bindings: { Pos: particles.Pos, Vel: particles.Vel, Mass: particles.Mass, Xpbd: xpbdUniforms, Sim: simUniform, ColliderTex: colliderTex, ColliderSampler: colliderSampler },
    });
    this.passes = [
      { name: 'contactsBuildSdfNode', node: contactsBuild },
      { name: 'xpbdProjectNode', node: project },
    ];
  }
}

