import {
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer
} from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import type { Config } from '../config';

export type RendererLike = WebGLRenderer | WebGPURenderer;

export class PostFX {
  private readonly renderer: RendererLike;
  private config: Config['postfx'];
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  private composer?: EffectComposer;
  private readonly size = new Vector2();
  private bloomPass?: UnrealBloomPass;
  private dofPass?: BokehPass;
  private vignettePass?: ShaderPass;
  private grainPass?: FilmPass;

  constructor(
    renderer: RendererLike,
    scene: Scene,
    camera: PerspectiveCamera,
    size: { width: number; height: number },
    config: Config['postfx']
  ) {
    this.renderer = renderer;
    this.config = config;
    this.scene = scene;
    this.camera = camera;
    this.size.set(size.width, size.height);

    if (renderer instanceof WebGLRenderer && config.enabled) {
      this.composer = new EffectComposer(renderer);
      this.composer.addPass(new RenderPass(scene, camera));

      this.bloomPass = new UnrealBloomPass(this.size.clone(), config.bloom.strength, config.bloom.radius, config.bloom.threshold);
      this.composer.addPass(this.bloomPass);

      this.dofPass = new BokehPass(scene, camera, {
        focus: config.dof.focus,
        aperture: config.dof.aperture,
        maxblur: config.dof.maxBlur
      });
      this.composer.addPass(this.dofPass);

      this.vignettePass = new ShaderPass(VignetteShader);
      this.vignettePass.uniforms['offset'].value = 1.0 - config.vignette * 0.5;
      this.vignettePass.uniforms['darkness'].value = 1.0 + config.vignette;
      this.composer.addPass(this.vignettePass);

      this.grainPass = new FilmPass();
      (this.grainPass.uniforms as Record<string, { value: number }>).nIntensity.value = config.grain * 2.5;
      this.composer.addPass(this.grainPass);

      this.setSize(size.width, size.height);
    }
  }

  update(config: Config['postfx']): void {
    this.config = config;
    if (this.bloomPass) {
      this.bloomPass.threshold = config.bloom.threshold;
      this.bloomPass.strength = config.bloom.strength;
      this.bloomPass.radius = config.bloom.radius;
    }
    if (this.dofPass) {
      this.dofPass.materialBokeh.uniforms['focus'].value = config.dof.focus;
      this.dofPass.materialBokeh.uniforms['aperture'].value = config.dof.aperture;
      this.dofPass.materialBokeh.uniforms['maxblur'].value = config.dof.maxBlur;
    }
    if (this.vignettePass) {
      this.vignettePass.uniforms['offset'].value = 1.0 - config.vignette * 0.5;
      this.vignettePass.uniforms['darkness'].value = 1.0 + config.vignette;
    }
    if (this.grainPass) {
      (this.grainPass.uniforms as Record<string, { value: number }>).nIntensity.value = config.grain * 2.5;
    }
  }

  setSize(width: number, height: number): void {
    this.size.set(width, height);
    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }

  render(delta: number): void {
    if (this.composer) {
      this.composer.render(delta);
    } else if ('render' in this.renderer) {
      (this.renderer as WebGLRenderer | WebGPURenderer).render(this.scene, this.camera);
    }
  }
}
