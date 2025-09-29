export { Convas, type ConvasOptions, type Feature } from './CONVAS';
export { defaultConfig, mergeConfig, type Config, type PartialDeep } from './config';
export { Stage } from './STAGE/stage';
export { PostFX } from './POSTFX/postfx';
export { Dashboard } from './UI/dashboard';
export { 
  ParticlesSim, 
  createParticlesFeature,
  PRESETS as ParticlePresets,
  getPreset as getParticlePreset,
  applyPreset as applyParticlePreset,
  colorToLinear,
  type ParticlesOptions,
  type SimStats,
  type Mode as ParticleMode
} from './PARTICLE/Particles.index';
