import { Pane } from 'tweakpane';
import type { Config } from '../config.js';
import { ensureDashboardStyles } from './panels.js';

export interface SectionParam {
  value: number | string | boolean;
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, number | string | boolean>;
}

export interface SectionSpec {
  title: string;
  params: Record<string, SectionParam>;
  onChange?: (key: string, value: SectionParam['value']) => void;
}

export class Dashboard {
  private readonly pane: Pane;
  private readonly sections = new Map<string, ReturnType<Pane['addFolder']>>();

  constructor(config: Config['dashboard']) {
    ensureDashboardStyles();
    this.pane = new Pane({
      title: 'Scaffold Dashboard',
      expanded: config.expanded
    });
    this.pane.element.classList.add('convas-dashboard');
  }

  section(id: string, spec: SectionSpec): void {
    if (this.sections.has(id)) {
      const folder = this.sections.get(id)!;
      folder.dispose();
      this.sections.delete(id);
    }

    const folder = this.pane.addFolder({ title: spec.title, expanded: true });
    this.sections.set(id, folder);

    Object.entries(spec.params).forEach(([key, param]) => {
      const params = { [key]: param.value };
      const input = folder.addBinding(params, key, {
        label: param.label ?? key,
        min: param.min,
        max: param.max,
        step: param.step,
        options: param.options
      });
      input.on('change', ev => {
        if (!spec.onChange) return;
        spec.onChange(key, ev.value as SectionParam['value']);
      });
    });
  }

  dispose(): void {
    this.sections.clear();
    this.pane.dispose();
  }
}
