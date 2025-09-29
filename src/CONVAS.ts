import { Clock, Color, Vector2, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WebGPURenderer } from 'three/examples/jsm/renderers/webgpu/WebGPURenderer.js';
import { mergeConfig, defaultConfig, type Config, type PartialDeep } from './config.js';
import { Stage } from './STAGE/stage.js';
import { PostFX } from './POSTFX/postfx.js';
import { Dashboard } from './UI/dashboard.js';

export interface Feature {
  id: string;
  attach(app: Convas): void | Promise<void>;
  detach?(app: Convas): void;
}

export interface ConvasOptions {
  config?: PartialDeep<Config>;
  features?: Feature[];
  autoStart?: boolean;
}

type RendererLike = WebGLRenderer | WebGPURenderer;

export class Convas {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: RendererLike;
  readonly config: Config;
  readonly stage: Stage;
  readonly postfx: PostFX;
  readonly dashboard: Dashboard;

  private readonly clock = new Clock();
  private readonly size = new Vector2(1, 1);
  private readonly features = new Map<string, Feature>();
  private controls?: OrbitControls;
  private raf?: number;
  private resizeObserver?: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, options: ConvasOptions = {}) {
    this.canvas = canvas;
    this.config = mergeConfig(defaultConfig, options.config);
    this.renderer = this.createRenderer(canvas, this.config);
    this.stage = new Stage(this.renderer, this.config);
    this.postfx = new PostFX(this.renderer, this.stage.scene, this.stage.camera, this.measureCanvas(), this.config.postfx);
    this.dashboard = new Dashboard(this.config.dashboard);
    this.setupDashboard();

    this.configureRenderer();
    this.configureControls();
    this.observeResize();

    if (options.features) {
      options.features.forEach(feature => {
        this.attachFeature(feature).catch(err => console.error('[CONVAS] Feature attach failed', err));
      });
    }

    if (options.autoStart ?? true) {
      this.start();
    }
  }

  private configureRenderer(): void {
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.size.x, this.size.y, false);
    (this.renderer as any).toneMapping = this.config.renderer.toneMapping;
    (this.renderer as any).outputColorSpace = this.config.renderer.colorSpace;
    if ('toneMappingExposure' in this.renderer) {
      (this.renderer as any).toneMappingExposure = this.config.renderer.exposure;
    }
    if ('setClearColor' in this.renderer) {
      (this.renderer as any).setClearColor(new Color(this.config.stage.background));
    }
    if ('shadowMap' in this.renderer) {
      (this.renderer as WebGLRenderer).shadowMap.enabled = true;
    }
    if (this.renderer instanceof WebGPURenderer) {
      this.renderer.init().catch(err => console.warn('WebGPU init failed, falling back to WebGL', err));
    }
  }

  private configureControls(): void {
    this.controls = new OrbitControls(this.stage.camera, this.canvas);
    this.controls.target.fromArray(this.config.camera.target);
    this.controls.enableDamping = true;
  }

  private observeResize(): void {
    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target !== this.canvas) continue;
        const { width, height } = entry.contentRect;
        this.resize(width, height);
      }
    });
    this.resizeObserver.observe(this.canvas);
    const rect = this.canvas.getBoundingClientRect();
    this.resize(rect.width || 1, rect.height || 1);
  }

  private createRenderer(canvas: HTMLCanvasElement, config: Config): RendererLike {
    const prefersWebGPU = config.renderer.useWebGPU && WebGPURenderer.isAvailable();
    if (prefersWebGPU) {
      return new WebGPURenderer({ canvas, antialias: config.renderer.antialias });
    }
    const renderer = new WebGLRenderer({ canvas, antialias: config.renderer.antialias });
    renderer.physicallyCorrectLights = true;
    renderer.outputEncoding = config.renderer.colorSpace as any;
    renderer.toneMappingExposure = config.renderer.exposure;
    return renderer;
  }

  private measureCanvas(): { width: number; height: number } {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || this.canvas.width || 1;
    const height = rect.height || this.canvas.height || 1;
    this.size.set(width, height);
    return { width, height };
  }

  private setupDashboard(): void {
    this.dashboard.section('renderer', {
      title: 'Renderer',
      params: {
        exposure: {
          value: this.config.renderer.exposure,
          min: 0.1,
          max: 4,
          step: 0.01,
          label: 'Exposure'
        }
      },
      onChange: (key, value) => {
        if (key === 'exposure') {
          this.config.renderer.exposure = value as number;
          if (this.renderer instanceof WebGLRenderer) {
            this.renderer.toneMappingExposure = this.config.renderer.exposure;
          } else {
            (this.renderer as WebGPURenderer).toneMappingExposure = this.config.renderer.exposure;
          }
        }
      }
    });

    this.dashboard.section('lights', {
      title: 'Lights',
      params: {
        key: { value: this.config.lights.keyIntensity, min: 0, max: 5, step: 0.05, label: 'Key' },
        fill: { value: this.config.lights.fillIntensity, min: 0, max: 5, step: 0.05, label: 'Fill' },
        rim: { value: this.config.lights.rimIntensity, min: 0, max: 5, step: 0.05, label: 'Rim' }
      },
      onChange: (key, value) => {
        const light = this.stage.lightRig.getObjectByName(key);
        if (light) {
          (light as any).intensity = value;
        }
      }
    });

    this.dashboard.section('postfx', {
      title: 'PostFX',
      params: {
        bloom: { value: this.config.postfx.bloom.strength, min: 0, max: 2, step: 0.01, label: 'Bloom' },
        dof: { value: this.config.postfx.dof.aperture, min: 0, max: 0.1, step: 0.001, label: 'DOF Aperture' },
        focus: { value: this.config.postfx.dof.focus, min: 0.1, max: 5, step: 0.01, label: 'Focus' }
      },
      onChange: (key, value) => {
        if (key === 'bloom') this.config.postfx.bloom.strength = value as number;
        if (key === 'dof') this.config.postfx.dof.aperture = value as number;
        if (key === 'focus') this.config.postfx.dof.focus = value as number;
        this.postfx.update(this.config.postfx);
      }
    });
  }

  private render = (): void => {
    const delta = this.clock.getDelta();
    this.controls?.update();
    this.postfx.render(delta);
    this.raf = requestAnimationFrame(this.render);
  };

  start(): void {
    if (this.raf != null) return;
    this.clock.start();
    this.raf = requestAnimationFrame(this.render);
  }

  stop(): void {
    if (this.raf == null) return;
    cancelAnimationFrame(this.raf);
    this.raf = undefined;
  }

  resize(width: number, height: number): void {
    if (!width || !height) return;
    this.size.set(width, height);
    this.stage.resize({ width, height });
    this.renderer.setSize(width, height, false);
    this.postfx.setSize(width, height);
  }

  async attachFeature(feature: Feature): Promise<void> {
    if (this.features.has(feature.id)) return;
    this.features.set(feature.id, feature);
    await feature.attach(this);
  }

  detachFeature(id: string): void {
    const feature = this.features.get(id);
    if (!feature) return;
    feature.detach?.(this);
    this.features.delete(id);
  }

  dispose(): void {
    this.stop();
    this.controls?.dispose();
    this.resizeObserver?.disconnect();
    this.dashboard.dispose();
    this.stage.dispose();
    this.features.forEach(feature => feature.detach?.(this));
    this.features.clear();
  }
}
