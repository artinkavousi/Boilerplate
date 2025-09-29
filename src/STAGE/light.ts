import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group
} from 'three';
import type { LightConfig } from '../config';

export class LightRig extends Group {
  constructor(config: LightConfig) {
    super();

    const color = new Color(config.color);
    const ambient = new AmbientLight(color, config.fillIntensity * 0.5);
    ambient.name = 'ambient';

    const key = new DirectionalLight(color, config.keyIntensity);
    key.position.set(5, 6, 4);
    key.castShadow = true;
    key.name = 'key';

    const fill = new DirectionalLight(color, config.fillIntensity);
    fill.position.set(-4, 3, -3);
    fill.name = 'fill';

    const rim = new DirectionalLight(color, config.rimIntensity);
    rim.position.set(-1, 5, 5);
    rim.name = 'rim';

    this.add(ambient, key, fill, rim);
  }
}
