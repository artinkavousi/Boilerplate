# Universal WebGPU+TSL Scaffold — **Final All‑in‑One Proposal** (Three.js r180+)

> **One‑liner:** A portable, ESM‑first, hot‑swappable 3D scaffold with **WebGPU + TSL** priority, **Three.js r180+**, a **Stage** (camera + lights + env + gizmos), a **PostFX** chain, and a **Dashboard UI** (Tweakpane, glassmorphism) — all orchestrated by a single **CONVAS** app and a shared **config**. Ships lean, merges related concerns for fewer files, and snaps into any project in minutes.

---

## 1) Executive Summary

* **Why:** You need a repeatable, polished foundation that boots a camera‑ready stage, material‑rich rendering, and designer‑friendly controls **without boilerplate** and supports **TSL node materials** (+ WebGPU) by default.
* **What:** A small ESM package (or copy‑paste starter) providing: Stage, PostFX, Dashboard, Convas (orchestrator), and Config. **Consolidated where sensible** to reduce files while keeping clean separation for reuse.
* **Outcome:** Spin up product shots, particles, and interactive tools with **consistent quality, performance budgets, and QA gates**.

---

## 2) Scope & Constraints

**In‑scope**

* Rendering via **WebGPU** (primary) with **WebGL2 fallback**.
* **TSL (Three Shading Language)** node materials as first choice; supports Physical/Transmission/Iridescence/Points/Lines.
* Stage: ground/grid/axes, HDRI IBL, key/fill/rim presets, transform gizmo.
* PostFX: tonemap, bloom, DOF (bokeh), vignette, grain; reorderable chain.
* UI: Tweakpane dashboard with glassmorphism styling, per‑module sections.
* Orchestrator (CONVAS): renderer init, scene lifecycle, hot‑swap features.
* Config: central, overridable at boot or per project.

**Out‑of‑scope** (initial)

* Full physics engine, skeletal animation authoring UI, node editor.

**Constraints**

* **ESM‑only** (no legacy CommonJS). TypeScript preferred; emit modern JS.
* No heavy frameworks; pure Three + small utilities. Keep bundle lean.

---

## 3) Architecture Overview

```
App (CONVAS)
 ├─ Stage  ──┬─ CameraRig (physical lens)
 │           ├─ LightRig (IBL + key/fill/rim)
 │           └─ Environment (ground/grid/axes/HDRI)
 ├─ PostFX (Composer: Tonemap → Bloom → DOF ...)
 ├─ Dashboard (Tweakpane; sections bound to Config + runtime)
 ├─ Material/TSL utilities (thin‑film, iridescence, SSS approx, points)
 └─ Config (renderer, camera, lights, postfx, perf tiers)
```

**Composition model:** CONVAS owns the renderer + loop, injects Stage and PostFX, and binds Dashboard sections to live parameters. Optional **Features** (plugins) attach/detach via a tiny interface for hot‑swap.

---

## 4) ESM File Layout (Preferred) — Low File Count, High Clarity

```
/src
  CONVAS.ts           # orchestrator (renderer, loop, injection, hot‑swap)
  config.ts           # shared parameters (overridable)
  /STAGE
    stage.ts          # scene root; adds ground/grid/axes; wires camera + lights
    camera.ts         # physical camera + resize
    light.ts          # IBL + key/fill/rim presets + exposure relay
  /POSTFX
    postfx.ts         # composer + passes; setSize/render
  /UI
    dashboard.ts      # Tweakpane sections; schema‑lite bindings
    panels.ts         # glassmorphism styles/util
```

**Ultra‑Compact Mode:** Merge `dashboard.ts` → `CONVAS.ts` and `camera.ts+light.ts` → `stage.ts` to get a **3‑file core** (`CONVAS.ts`, `config.ts`, `stage.ts`).

---

## 5) Module Contracts (Stable API)

**Stage**

```ts
class Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera; // physical settings
  add(node: THREE.Object3D): void;
  resize(size: {width:number;height:number}): void;
}
```

**PostFX**

```ts
class PostFX {
  constructor(renderer, scene, camera, size, opts);
  setSize(w:number,h:number): void;
  render(dt:number): void;
}
```

**Dashboard**

```ts
class Dashboard {
  section(id: string, spec: { title: string; params: Record<string, any>; onChange?: (k,v)=>void }): void;
  destroy(): void;
}
```

**Feature (optional plugin)**

```ts
interface Feature { id: string; attach(app: Convas): void|Promise<void>; detach?(app: Convas): void; }
```

---

## 6) WebGPU + TSL Strategy

* **Primary:** `WebGPURenderer` with TSL node materials; shared nodes for thin‑film interference, chromatic dispersion, custom fog, noise.
* **Fallback:** WebGL2 `WebGLRenderer` with equivalent NodeMaterial graphs.
* Post chain in WebGPU: prefer **nodes‑based post passes**; fallback uses EffectComposer equivalents.
* **Material registry** (optional add‑on): `make('glass'|'metal'|'plastic'|'iridescent'|'points', params)` → returns a configured material; presets saved as JSON.

---

## 7) Dashboard UX (Glassmorphism)

* Tweakpane inside a glass panel (`.pane-wrap`), blur + border + shadow.
* Sections: **Render** (exposure, tonemap), **Lights**, **PostFX**, **Camera** (fov/aperture/focus), **Presets** (save/load), **Debug** (perf HUD, self‑checks).
* Keyboard: `QWER` gizmo modes (if TransformControls added), `F` to frame, `Ctrl+P` to focus panel.

---

## 8) Config & Profiles

```ts
export const Config = {
  renderer: { preferWebGPU: true, toneMapping: 'ACES', exposure: 1.0, antialias: true, colorSpace: 'srgb' },
  camera:   { fov: 45, near: 0.1, far: 200, filmGauge: 35, aperture: 2.8, focus: 3.0 },
  lights:   { enableIBL: true, keyIntensity: 45, fillIntensity: 6, rimIntensity: 12 },
  postfx:   { bloom:{enabled:true,strength:0.8,radius:0.2,threshold:0.9}, dof:{enabled:true,aperture:2.8,maxBlur:0.015} },
  perf:     { tier: 'high', resolutionScale: 1.0, shadows: 'med' }
} as const;
```

**Override patterns**

* At boot: `new Convas(canvas, { config: deepMerge(Config, yourOverrides) })`.
* Per‑project config file that exports a `Partial<typeof Config>`.

---

## 9) Integration (Drop‑In)

**As a package** (`npm i @your/universal-scaffold`)

```ts
import { Convas, Config } from '@your/universal-scaffold';
new Convas(document.querySelector('#app') as HTMLCanvasElement, { config: { renderer: { exposure: 1.2 } } });
```

**As starter files**: copy `/src` + `/public/index.html`, run `vite`.

---

## 10) Quality, Performance & Self‑Checks

* **Budgets:** main thread < 4 ms, GPU < 12 ms on mid‑tier dGPU (1080p), 60 FPS target.
* **Self‑checks:**

  * Color: sRGB textures in correct slots; PMREM present for IBL; tone map sanity.
  * Materials: Node graphs have no NaNs; transmission thickness sane.
  * Scene: no missing normals/tangents on PBR meshes.
  * Lifecycle: all disposables freed on detach.
* **Perf tiers:** low/med/high/ultra switch toggles resolution scale, shadow tier, postfx count.

---

## 11) Deliverables (MVP)

1. **ESM code** for `CONVAS.ts`, `config.ts`, `STAGE/{stage,camera,light}.ts`, `POSTFX/postfx.ts`, `UI/{dashboard,panels}.ts` (+ minimal `index.html`).
2. **Demo scene** with a transmissive + iridescent material and studio HDR.
3. **Dashboard presets**: exposure, lights, bloom, DOF.
4. **Docs**: README (install/run), API (Stage/PostFX/Dashboard), WebGPU switch notes.

---

## 12) Roadmap

**P1 (Core, Week 1–2)**

* Stage, PostFX (bloom/DOF), Dashboard, Config, demo.
* WebGPU capability probe + fallback; basic self‑checks.

**P2 (Enhance, Week 3–4)**

* Material registry (TSL nodes), Post graph UI reordering, presets save/load.
* Feature plugin interface + example (Particles compute or Audio‑reactive).

**P3 (Polish, Week 5+)**

* Inspector/outliner, screenshot/record (WebCodecs), SSS/skin improvements.

---

## 13) Risks & Mitigations

* **WebGPU coverage**: Fall back to WebGL2 seamlessly; maintain parity for core features.
* **Bundle bloat**: Keep dependencies minimal; lazy‑load HDR/GLTF; optional features as plugins.
* **Material parity**: Maintain shared TSL node library so both paths share logic.

---

## 14) Acceptance Criteria

* Cold boot < **2s** (cached) to a lit stage + panel.
* PostFX bloom + DOF stable on mid‑tier GPU; exposure controls responsive.
* HDRI IBL correctly PMREM’d; color pipeline sane (sRGB/linear verified).
* Swappable **Feature** example loads/unloads without leaks.
* Self‑checks pass; no console errors.

---

## 15) Test Matrix

* **Browsers:** Chrome stable/Canary, Edge; Firefox (fallback).
* **GPUs:** iGPU (fallback), mid dGPU, high dGPU.
* **Scenes:** Studio (transmission), Outdoor HDR (metals), Points cloud.
* **Metrics:** FPS, CPU/GPU time, memory, hitch count.

---

## 16) Implementation Notes (Style & Patterns)

* Prefer **single‑responsibility inner classes** inside modules over many files.
* Keep **public API tiny**; hide implementation details.
* Use **typed params** and **readonly config**; expose **onChange hooks** via Dashboard sections.
* Dispose diligently: materials, geometries, render targets, passes.

---

## 17) Future Add‑Ons

* **Particles (WebGPU compute)** with field forces; fallback via GPGPU TSL.
* **Audio‑reactive** bindings (FFT → material params, forces).
* **Recorder** (WebCodecs/WebM, PNG sequence) and **Timeline** clips.

---

## 18) Glossary

* **TSL:** Three.js Shading Language node system for authoring materials/passes.
* **PMREM:** Prefiltered Mipmapped Radiance Environment Map for IBL.
* **IBL:** Image‑Based Lighting using HDR textures.

---

### Appendix A — Boot Snippet

```ts
import { Convas, Config } from './src/CONVAS'; // or package entry
new Convas(document.getElementById('app') as HTMLCanvasElement, { config: { renderer: { exposure: 1.25 } } });
```

### Appendix B — Feature Example (Attach/Detach)

```ts
export default {
  id: 'particles.basic',
  async attach(app) { /* allocate buffers, add to scene */ },
  detach(app) { /* remove from scene, dispose */ }
};
```

**End of Proposal.**
