import { Pane, type FolderApi, type TpChangeEvent } from 'tweakpane';
import type { Config } from '../config';
import { ensureDashboardStyles } from './panels';

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
  private readonly sections = new Map<string, FolderApi>();

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

    const paneAsFolder = this.pane as unknown as FolderApi;
    const folder = paneAsFolder.addFolder({ title: spec.title, expanded: true });
    this.sections.set(id, folder);

    Object.entries(spec.params).forEach(([key, param]) => {
      const params = { [key]: param.value };
      const binding = folder.addBinding(params, key, {
        label: param.label ?? key,
        min: param.min,
        max: param.max,
        step: param.step,
        options: param.options
      });
      binding.on('change', (ev: TpChangeEvent<SectionParam['value']>) => {
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
