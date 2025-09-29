## Three.js WebGPU Nodes + TSL Reference (Source of Truth)

This document is a comprehensive, production-grade reference for Three.js’s WebGPU Node System and Three Shading Language (TSL), covering core nodes, utilities, accessors, display/post-processing nodes, lighting, GPGPU, BSDF/material functions, parsers, PMREM, and the JSM TSL effect nodes. It consolidates and organizes all relevant modules from:

- `src/nodes` (node classes, TSL exports, utils, lighting models)
- `src/renderers/webgpu` (WGSL builder, libraries, renderer glue)
- `examples/jsm/tsl` (post-processing/effect nodes)
- `build/three.webgpu.nodes.js` and `build/three.tsl.js` (distribution builds)

Use this as your single source of truth to discover APIs, compose nodes/TSL, and wire effects in WebGPU pipelines.

### Table of Contents

- Overview
- Quick Start (TSL + Nodes)
- TSL: Built-ins and Helpers (overview and usage)
- Nodes Inventory
  - Core
  - Utils
  - Math
  - Accessors
  - Display
  - Fog
  - Geometry
  - GPGPU
  - Lighting + Models
  - Parsers
  - PMREM
  - Procedural
  - Shapes
- WebGPU Renderer + WGSL
- JSM TSL Effects (Post-Processing)
- Patterns and Best Practices

---

### Overview

- **TSL (Three Shading Language)**: A declarative, strongly-typed, chainable node language for generating WGSL/GLSL shaders. Exposed via functions like `vec3()`, `add()`, `mul()`, `uv()`, `texture()`, `Fn()`, `Loop()`, etc.
- **Nodes**: Object-oriented nodes composing shader graphs and render passes. Many extend `TempNode`, produce `fragmentNode`/`colorNode`, and can render to `RenderTarget` for multi-pass pipelines.
- **WebGPU**: The WebGPURenderer integrates the node system with a WGSL codegen pipeline via `WGSLNodeBuilder`, `WGSLNodeParser`, and standard/basic node libraries.
- **Distribution builds**: `three.tsl.js` re-exports TSL helpers; `three.webgpu.nodes.js` re-exports node classes and node-friendly materials/utilities for WebGPU.

---

### Quick Start (TSL + Nodes)

```js
import { WebGPURenderer, Scene, PerspectiveCamera, Mesh, BoxGeometry, MeshStandardMaterial } from 'three/webgpu';
import { vec3, color, uv, texture, Fn } from 'three/tsl';

// Create a material using TSL nodes
const mat = new MeshStandardMaterial();
mat.colorNode = color(0.8, 0.2, 0.3);
mat.emissiveNode = vec3(0.02);

// Or a custom fragment composition
const checkerFn = Fn(() => {
  const uvNode = uv();
  const c = uvNode.x.floor().add(uvNode.y.floor()).mod(2.0);
  return vec3(c).mix(vec3(0.1), vec3(0.9));
});
mat.colorNode = checkerFn();

const mesh = new Mesh(new BoxGeometry(), mat);
```

Post-processing with JSM TSL effects:

```js
import { PostProcessing } from 'three/webgpu';
import { pass, mrt, output, emissive } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const post = new PostProcessing(renderer);
const scenePass = pass(scene, camera);
const sceneColor = scenePass.getTextureNode('output');
const bloomNode = bloom(sceneColor, 1.0, 0.2, 0.0);
post.outputNode = sceneColor.add(bloomNode);
```

---

### TSL: Built-ins and Helpers (overview)

TSL provides constructors (`float`, `vec2`, `vec3`, `vec4`, `mat3`, `mat4`, ...), operators (`add`, `sub`, `mul`, `div`, `mix`, `dot`, `normalize`, ...), control flow (`If`, `Loop`, `Break`, `Return`), shader stages, and a large catalog of domain helpers (lighting BRDFs, tone mapping, color spaces, textures, storage, workgroups, etc.). In the distribution build they’re re-exported for direct import.

Key categories you will use frequently:

- Scalars/Vectors/Matrices: `float()`, `vec2()`, `vec3()`, `vec4()`, `mat3()`, `mat4()`
- Operators/Math: `add`, `sub`, `mul`, `div`, `pow`, `sqrt`, `floor`, `fract`, `abs`, `min`, `max`, `mix`, `clamp`, `normalize`, `dot`, `cross`
- Flow/Structs: `Fn`, `If`, `Loop`, `Break`, `Return`, `struct`, `outputStruct`
- Shader I/O: `uniform`, `property`, `varying`, `attribute`, `sampler`, `texture`, `textureSize`
- Geometry/Space: `uv`, `positionView`, `normalView`, `modelViewProjection`, `getViewPosition`, `getScreenPosition`
- Materials: `materialColor`, `roughness`, `metalness`, `emissive`, `clearcoat*`, `ior`, `transmission`, `sheen*`
- Tone/Color: `toneMapping`, `convertColorSpace`, `colorSpaceToWorking`, `workingToColorSpace`, `acesFilmicToneMapping`, `agxToneMapping`
- Lighting BRDFs: `BRDF_GGX`, `BRDF_Lambert`, `DFGApprox`, `F_Schlick`, `V_GGX_SmithCorrelated`, etc.
- Post-processing helpers: `pass`, `passTexture`, `mrt`, `renderOutput`, `viewportTexture`
- GPGPU: `compute`, `workgroupArray`, `storage`, `storageTexture`, `atomic*`, `subgroup*`, `workgroupBarrier`

You can compose custom functions via `Fn((inputs) => { ... })` and use `setLayout({ name, type, inputs })` to give them explicit signatures.

Reference: The distribution `three.tsl.js` enumerates all exported TSL symbols. Example excerpt below shows the pattern and scale of exports.

```1:100:c:\Users\ARTDESKTOP\Desktop\CODE\.aug\flowv1\codexv\three.js-dev\three.js-dev\build\three.tsl.js
import { TSL } from 'three/webgpu';
const BRDF_GGX = TSL.BRDF_GGX;
const BRDF_Lambert = TSL.BRDF_Lambert;
const BasicPointShadowFilter = TSL.BasicPointShadowFilter;
// ... many more exports ...
export { BRDF_GGX, BRDF_Lambert, /* ... massive list ... */ };
```

---

### Nodes Inventory

This section summarizes the modules in `src/nodes`. For each class, we list purpose and typical usage surface. Import paths are relative to `three/webgpu` or `three/src/nodes` re-exports depending on build/consumption style.

#### Core

- `ArrayNode`, `AssignNode`, `AttributeNode`, `BypassNode`, `CacheNode`, `ConstNode`, `ContextNode`, `IndexNode`, `LightingModel`, `Node`, `NodeAttribute`, `NodeBuilder`, `NodeCache`, `NodeCode`, `NodeFrame`, `NodeFunction`, `NodeFunctionInput`, `NodeUniform`, `NodeVar`, `NodeVarying`, `ParameterNode`, `PropertyNode`, `StackNode`, `TempNode`, `UniformGroupNode`, `UniformNode`, `VarNode`, `VaryingNode`, `StructNode`, `StructTypeNode`, `OutputStructNode`, `MRTNode`, `SubBuildNode`.
  - Purpose: Graph infrastructure, shader function binding, frame state, varying/uniform/property orchestration, multi-render-target support, struct typing.
  - Usage: Extend `TempNode` for effect nodes; in materials, assign `colorNode|emissiveNode|opacityNode` etc. `MRTNode` builds multiple named outputs.

#### Utils

- `ArrayElementNode`, `ConvertNode`, `FunctionOverloadingNode`, `JoinNode`, `LoopNode`, `MaxMipLevelNode`, `RemapNode`, `RotateNode`, `SetNode`, `SplitNode`, `SpriteSheetUVNode`, `StorageArrayElementNode`, `ReflectorNode`, `RTTNode`, `MemberNode`, `DebugNode`, `EventNode`, `EquirectUV`, `MatcapUV`, `UVUtils`, `ViewportUtils`, `TriplanarTextures`, `Timer`, `SampleNode`, `PostProcessingUtils`, `Packing`, `Oscillators`, `FlipNode`.
  - Purpose: Composition helpers, UV/texture utilities, time/oscillation, triplanar sampling, RTT patterns.

#### Math

- `BitcastNode`, `Hash`, `MathUtils`, `TriNoise3D`, `ConditionalNode`, `OperatorNode`.
  - Purpose: Low-level arithmetic/bit manipulation, noise, conditions.

#### Accessors

- `UniformArrayNode`, `BufferAttributeNode`, `BufferNode`, `VertexColorNode`, `CubeTextureNode`, `InstanceNode`, `InstancedMeshNode`, `BatchNode`, `MaterialNode`, `MaterialReferenceNode`, `RendererReferenceNode`, `MorphNode`, `ModelNode`, `Object3DNode`, `PointUVNode`, `ReferenceNode`, `ReflectVector`, `SceneNode`, `SkinningNode`, `StorageBufferNode`, `StorageTextureNode`, `Tangent`, `TangentUtils`, `Texture3DNode`, `TextureBicubic`, `TextureNode`, `TextureSizeNode`, `UserDataNode`, `UV`, `VelocityNode`, `Camera`, `Position`, `Normal`, `ModelViewProjectionNode`.
  - Purpose: Bind object/material/camera state, attributes, buffers, textures.
  - Example:
    ```js
    import { materialColor, normalView, positionView } from 'three/tsl';
    mat.colorNode = materialColor.mul(normalView.z.saturate());
    ```

#### Display

- `BumpMapNode`, `ColorSpaceNode`, `FrontFacingNode`, `NormalMapNode`, `PosterizeNode`, `RenderOutputNode`, `ScreenNode`, `ToneMappingNode`, `ToonOutlinePassNode`, `Viewport*` nodes (`ViewportTextureNode`, `ViewportDepthTextureNode`, `ViewportSharedTextureNode`, `ViewportDepthNode`).
  - Purpose: Screen-space data, tone/color processing, post outlines, viewport textures.

#### Fog

- `Fog`: Exposes fog density/range computations as nodes.

#### Geometry

- `RangeNode`: Utility for linear ranges; useful in procedural UV/geometry expressions.

#### GPGPU

- `ComputeNode`, `ComputeBuiltinNode`, `BarrierNode`, `WorkgroupInfoNode`, `AtomicFunctionNode`, `SubgroupFunctionNode`.
  - Purpose: Compute passes with workgroups, atomics, barriers, and subgroup ops. Compose kernels with `compute()` + WGSL nodes.

#### Lighting

- Lights: `AmbientLightNode`, `AnalyticLightNode`, `AONode`, `BasicEnvironmentNode`, `BasicLightMapNode`, `DirectionalLightNode`, `EnvironmentNode`, `HemisphereLightNode`, `IESSpotLightNode`, `IrradianceNode`, `LightingContextNode`, `LightingNode`, `LightProbeNode`, `LightsNode`, `LightUtils`, `PointLightNode`, `PointShadowNode`, `ProjectorLightNode`, `RectAreaLightNode`, `ShadowBaseNode`, `ShadowFilterNode`, `ShadowNode`, `SpotLightNode`.
  - Models: `BasicLightingModel`, `PhongLightingModel`, `PhysicalLightingModel`, `ShadowMaskModel`, `ToonLightingModel`, `VolumetricLightingModel`.
  - Purpose: Declarative light inputs, shadowing, and lighting models pluggable into materials (`mat.lightsNode`, BRDF wiring).

#### Parsers

- `GLSLNodeParser`, `GLSLNodeFunction`: Back-compat for GLSL node parsing. WGSL is handled by WebGPU modules.

#### PMREM

- `PMREMNode`, `PMREMUtils`: Prefiltered environment maps as nodes.

#### Procedural / Shapes

- `procedural/Checker`, `shapes/Shapes`: Base building blocks for procedural patterns and shapes.

---

### WebGPU Renderer + WGSL

Key modules in `src/renderers/webgpu`:

- `WebGPURenderer`: WebGPU-based renderer integrating the node system.
- `WebGPURenderer.Nodes`: Node-specialized renderer hooks.
- `WebGPUBackend`: Device/adapter, command submission, resource lifecycle.
- `nodes/WGSLNodeBuilder`, `WGSLNodeParser`, `WGSLNodeFunction`: Generate WGSL code from node graphs and TSL constructs.
- `nodes/BasicNodeLibrary`, `StandardNodeLibrary`: Built-in node libraries registered into the builder.
- `utils/*`: Bindings, textures, pipelines, timestamps, attributes utilities.

Usage note: Materials accept node assignments (`colorNode`, `opacityNode`, etc.). Post-processing/effects are implemented as `TempNode`-based classes rendering via internal `NodeMaterial` instances and `RenderTarget`s.

---

### JSM TSL Effects (examples/jsm/tsl)

The `examples/jsm/tsl` folder contains production-ready post-processing and display-space effect nodes. They follow a consistent pattern:

- A class extending `TempNode` that encapsulates state, render targets, and one or more internal `NodeMaterial`s.
- A `setup(builder)` method producing TSL graphs for each pass/material.
- An optional `updateBefore(frame)` that renders the passes every frame.
- A small helper export function (e.g., `bloom(...)`) that wraps construction with `nodeObject()`.

Selected nodes with API details:

#### BloomNode

- Import: `import { bloom } from 'three/addons/tsl/display/BloomNode.js'`
- Constructor: `new BloomNode(inputNode, strength=1, radius=0, threshold=0)`
- Properties: `strength`, `radius`, `threshold`, `smoothWidth`
- Methods: `getTextureNode()`, `setSize(w,h)`, `setup(builder)`, `updateBefore(frame)`, `dispose()`
- Usage:
  ```js
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');
  const bloomNode = bloom(color, 1.0, 0.2, 0.0);
  post.outputNode = color.add(bloomNode);
  ```

#### DepthOfFieldNode (DOF)

- Import: `import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js'`
- Constructor: `new DepthOfFieldNode(textureNode, viewZNode, focusDistanceNode, focalLengthNode, bokehScaleNode)`
- Uniforms: `_invSize`, internal multi-pass RTs (CoC near/far, blur64, blur16, composite)
- Methods: `getTextureNode()`, `setSize(w,h)`, `setup(builder)`, `updateBefore(frame)`, `dispose()`
- Helper: `dof(node, viewZ, focusDistance=1, focalLength=1, bokehScale=1)`
- Usage:
  ```js
  const depth = scenePass.getTextureNode('depth');
  const viewZ = logarithmicDepthToViewZ(depth, camera.near, camera.far); // or suitable depth to viewZ
  post.outputNode = dof(sceneColor, viewZ, 5, 2, 1.0);
  ```

#### FXAANode

- Import: `import { fxaa } from 'three/addons/tsl/display/FXAANode.js'`
- Constructor: `new FXAANode(textureNode)`
- Notes: Assumes sRGB input; do tone mapping/color space conversion before AA.
- Usage:
  ```js
  post.outputNode = fxaa(sceneColor);
  ```

#### GTAONode (Ground Truth Ambient Occlusion)

- Import: `import { ao } from 'three/addons/tsl/display/GTAONode.js'`
- Constructor: `new GTAONode(depthNode, normalNode|null, camera)`
- Uniforms: `radius`, `resolution`, `thickness`, `distanceExponent`, `distanceFallOff`, `scale`, `samples`
- Methods: `getTextureNode()`, `setSize(w,h)`, `setup(builder)`, `updateBefore(frame)`, `dispose()`
- Usage:
  ```js
  const depth = scenePass.getTextureNode('depth');
  const normal = scenePass.getTextureNode('normal'); // optional (can reconstruct from depth)
  const aoNode = ao(depth, normal, camera);
  post.outputNode = aoNode.getTextureNode().mul(sceneColor);
  ```

Other effect nodes (similar structure; consult file for exact params):

- Display: `AfterImageNode`, `AnaglyphPassNode`, `AnamorphicNode`, `BleachBypass`, `ChromaticAberrationNode`, `DenoiseNode`, `DotScreenNode`, `FilmNode`, `GaussianBlurNode`, `GTAONode`, `LensflareNode`, `Lut3DNode`, `MotionBlur`, `OutlineNode`, `ParallaxBarrierPassNode`, `PixelationPassNode`, `RGBShiftNode`, `Sepia`, `SMAANode`, `SobelOperatorNode`, `SSAAPassNode`, `SSGINode`, `SSRNode`, `StereoCompositePassNode`, `StereoPassNode`, `TRAANode`, `TransitionNode`, `boxBlur`, `hashBlur`.
- Lighting: `TiledLightsNode`.
- Shadows: `TileShadowNode` (+ `TileShadowNodeHelper`).
- Math: `Bayer`.
- Utils: `Raymarching`.

Each of these exports a default class and often a convenience function (e.g., `chromaticAberration(node, amount)`, `rgbShift(node, amount)`, etc.). Typical usage: create a scene pass, extract textures via `getTextureNode(key)`, feed into the effect function, then compose into `post.outputNode`.

---

### Per-Node API Details (JSM TSL)

Below are concise API breakdowns (constructor params, uniforms/properties, helper export) for representative and complex nodes. Use these as templates—other files follow similar patterns.

#### AfterImageNode

- Class: `AfterImageNode(textureNode, damp=0.96)`
- Uniforms/props: `textureNode`, `textureNodeOld`, `damp`, internal `RenderTarget`s `_compRT`, `_oldRT`.
- Methods: `setSize(w,h)`, `getTextureNode()`, `updateBefore(frame)`, `setup(builder)`, `dispose()`
- Export helper: `afterImage(node, damp)`

```1:40:c:\Users\ARTDESKTOP\Desktop\CODE\.aug\flowv1\codexv\three.js-dev\three.js-dev\examples\jsm\tsl\display\AfterImageNode.js
class AfterImageNode extends TempNode {
  constructor(textureNode, damp=0.96) { /* sets up RTs and damp */ }
  setup(builder) { /* threshold + damped max blending */ }
}
export const afterImage = (node, damp) => nodeObject(new AfterImageNode(convertToTexture(node), damp));
```

#### BloomNode

- Class: `BloomNode(inputNode, strength=1, radius=0, threshold=0)`
- Uniforms/props: `strength`, `radius`, `threshold`, `smoothWidth`, internal mips RTs, materials for high-pass, separable blur, composite.
- Methods: `setSize(w,h)`, `updateBefore(frame)`, `setup(builder)` builds high-pass, N separable blurs, composite; `getTextureNode()`, `dispose()`
- Export helper: `bloom(node, strength, radius, threshold)`

#### DepthOfFieldNode

- Class: `DepthOfFieldNode(textureNode, viewZNode, focusDistanceNode, focalLengthNode, bokehScaleNode)`
- Uniforms/props: `_invSize`, multiple RTs: CoC near/far, blurred CoC, blur64, blur16 near/far, composite; materials for each pass.
- Methods: `setSize`, `updateBefore`, `setup(builder)` (CoC, near-field preblur, bokeh64 then 16 taps, final composite), `getTextureNode()`, `dispose()`
- Helper: `dof(node, viewZNode, focusDistance=1, focalLength=1, bokehScale=1)`

#### FXAANode

- Class: `FXAANode(textureNode)`
- Uniforms: `_invSize`
- Methods: `updateBefore`, `setup()` builds `ApplyFXAA(uv, texSize)`; returns vec4
- Helper: `fxaa(node)`

#### GTAONode

- Class: `GTAONode(depthNode, normalNode|null, camera)`
- Uniforms: `radius`, `resolution`, `thickness`, `distanceExponent`, `distanceFallOff`, `scale`, `samples`, camera uniforms, internal noise texture.
- Methods: `setSize`, `updateBefore`, `setup()` (depth handling, noise, slice/steps loops, horizons), `getTextureNode()`, `dispose()`
- Helper: `ao(depthNode, normalNode, camera)`

#### GaussianBlurNode

- Class: `GaussianBlurNode(textureNode, directionNode|null, sigma=4, options={premultipliedAlpha?:boolean, resolutionScale?:number})`
- Uniforms: `_invSize`, `_passDirection`
- Internal RTs: `_horizontalRT`, `_verticalRT`; result is `_verticalRT.texture` via `passTexture`.
- Methods: `setSize`, `updateBefore`, `setup(builder)` using coefficients via `_getCoefficients`, optional premultiply/unpremultiply path; `dispose()`
- Helpers: `gaussianBlur(node, direction, sigma, options)`, `premultipliedGaussianBlur` (deprecated alias)

#### ChromaticAberrationNode

- Class: `ChromaticAberrationNode(textureNode, strengthNode, centerNode, scaleNode)`
- Uniforms: `_invSize` (computed in `updateBefore`)
- Methods: `setup()` builds channel-separated scaled UVs and per-channel offsets; returns vec4
- Helper: `chromaticAberration(node, strength=1.0, center=null, scale=1.1)`

#### FilmNode

- Class: `FilmNode(inputNode, intensityNode=null, uvNode=null)`
- Methods: `setup()` mixes base with noise-weighted color; optional intensity blend
- Helper: `film` via `nodeProxy(FilmNode)`

#### DotScreenNode

- Class: `DotScreenNode(inputNode, angle=1.57, scale=1)`
- Uniforms: `angle`, `scale`
- Methods: `setup()` computes rotated UV grid and sine pattern; returns vec4
- Helper: `dotScreen(node, angle, scale)`

#### RGBShiftNode

- Class: `RGBShiftNode(textureNode, amount=0.005, angle=0)`
- Uniforms: `amount`, `angle`
- Methods: `setup()` offset UV per-channel; returns vec4
- Helper: `rgbShift(node, amount, angle)`

#### Sepia

- Function: `sepia(color)` returns vec4

#### DenoiseNode

- Class: `DenoiseNode(textureNode, depthNode, normalNode, camera)`
- Uniforms: `lumaPhi`, `depthPhi`, `normalPhi`, `radius`, `index`, `_resolution`
- Methods: `updateBefore` (sync resolution), `setup()` neighborhood-weighted bilateral-like denoise with random rotation; `dispose()`
- Helper: `denoise(node, depthNode, normalNode, camera)`

#### LensflareNode

- Class: `LensflareNode(textureNode, params={ ghostTint, threshold, ghostSamples, ghostSpacing, ghostAttenuationFactor, downSampleRatio })`
- Props: per-parameter nodes, `_renderTarget`, `_material` and `_textureNode`
- Methods: `setSize`, `updateBefore`, `setup(builder)` ghosts accumulation; `getTextureNode()`, `dispose()`
- Helper: `lensflare(node, params)`

#### Lut3DNode

- Class: `Lut3DNode(inputNode, lutNode, size, intensityNode)`
- Uniforms: `size`, `intensityNode`
- Methods: `setup()` samples 3D LUT; returns vec4
- Helper: `lut3D(node, lut, size, intensity)`

#### OutlineNode

- Class: `OutlineNode(scene, camera, { selectedObjects, edgeThickness=float(1), edgeGlow=float(0), downSampleRatio=2 })`
- Multiple RTs: depth, mask, edge buffers, blur buffers, composite
- Materials: depth prepass, prepare mask, copy, edge detection, separable blurs, composite
- Methods: `setSize`, `updateBefore`, `setup()`; getters `visibleEdge`, `hiddenEdge`
- Helper: `outline(scene, camera, params)`

#### ParallaxBarrierPassNode

- Class: `ParallaxBarrierPassNode(scene, camera)` extends `StereoCompositePassNode`
- Methods: `setup(builder)` alternating rows sample left/right
- Helper: `parallaxBarrierPass(scene, camera)`

#### PixelationPassNode / PixelationNode

- `PixelationNode(texture, depth, normal, pixelSize, normalEdgeStrength, depthEdgeStrength)`; computes edge-aware pixelation; uniforms `_resolution`.
- `PixelationPassNode(scene, camera, pixelSize=6, normalEdgeStrength=0.3, depthEdgeStrength=0.4)`; overrides `setSize` to downscale; builds MRT for `normal`.
- Helpers: internal `pixelation(...)`, exported `pixelationPass(scene, camera, ...)`

#### SMAANode

- Class: `SMAANode(textureNode)` with three RTs: `edges`, `weights`, `blend`
- Textures: baked `area`, `search` PNGs loaded to `Texture`
- Uniforms: `_invSize`
- Methods: `setSize`, `updateBefore`, `setup(builder)` builds three materials VS/FS; `getTextureNode()`, `dispose()`
- Helper: `smaa(node)`

#### SobelOperatorNode

- Class: `SobelOperatorNode(textureNode)`
- Uniforms: `_invSize`
- Methods: `updateBefore`, `setup()` computes Sobel gradient; `getTextureNode()`
- Helper: `sobel(node)`

#### SSAAPassNode

- Class: `SSAAPassNode(scene, camera)` extends `PassNode` (COLOR)
- Props: `sampleLevel`, `unbiased`, `clearColor`, `clearAlpha`, `sampleWeight`
- Methods: `updateBefore(frame)` renders N jittered samples and accumulates; `setup(builder)` sets up MRT-aware accumulation material; `dispose()`
- Helper: `ssaaPass(scene, camera)`

#### SSGINode

- Class: `SSGINode(beautyNode, depthNode, normalNode, camera)`
- Uniforms: `sliceCount(uint)`, `stepCount(uint)`, `aoIntensity`, `giIntensity`, `radius`, `useScreenSpaceSampling(bool)`, `expFactor`, `thickness`, `useLinearThickness(bool)`, `backfaceLighting`
- Methods: `setSize`, `updateBefore`, `setup(builder)` builds horizon sampling loops; `getTextureNode()`, `dispose()`
- Helper: `ssgi(beautyNode, depthNode, normalNode, camera)`

#### SSRNode

- Class: `SSRNode(colorNode, depthNode, normalNode, metalnessNode, roughnessNode=null, camera=null)`
- Uniforms: `maxDistance`, `thickness`, `opacity`, `quality`, `blurQuality`
- Internal RTs: `_ssrRenderTarget`, `_blurRenderTarget` (mips if roughness present)
- Methods: `setSize`, `updateBefore`, `setup(builder)` builds line/plane distance, raymarch with early exit, optional blur mips, returns texture; `getTextureNode()`, `dispose()`
- Helper: `ssr(color, depth, normal, metalness, roughness?, camera?)`

#### StereoPassNode / StereoCompositePassNode / AnaglyphPassNode / ParallaxBarrierPassNode

- `StereoPassNode(scene, camera)`: renders L/R halves with `StereoCamera` to a single RT.
- `StereoCompositePassNode(scene, camera)`: renders L/R to two RTs and composites via `_material`.
- `AnaglyphPassNode(scene, camera)`: extends `StereoCompositePassNode`; adds Dubois color matrices; helper `anaglyphPass(...)`.
- `ParallaxBarrierPassNode(scene, camera)`: alternating line sampling; helper `parallaxBarrierPass(...)`.

#### TransitionNode

- Class: `TransitionNode(textureNodeA, textureNodeB, mixTextureNode, mixRatioNode, thresholdNode, useTextureNode)`
- Method: `setup()` computes thresholded mix using `mixTextureNode` or simple mix
- Helper: `transition(nodeA, nodeB, mixTexture, mixRatio, threshold, useTexture)`

#### TiledLightsNode (lighting)

- Class: `TiledLightsNode(maxLights=1024, tileSize=32)` extends `LightsNode`
- Props: `maxLights`, `tileSize`, buffers and textures; uniforms `_lightsCount`, `_screenSize`, `_cameraProjectionMatrix`, `_cameraViewMatrix`
- Methods: `setLights(lights)`, `setSize`, `updateProgram`, `updateBefore`, `setupLights(builder, lightNodes)` to iterate per-tile light list; `getTile`, `getLightData`
- Helper: `tiledLights` via `nodeProxy(TiledLightsNode)`

#### TileShadowNode (shadows)

- Class: `TileShadowNode(light, {tilesX=2, tilesY=2, resolution=light.shadow.mapSize, debug=false})` extends `ShadowBaseNode`
- Creates array depth texture, per-tile lights/shadow nodes and `ArrayCamera`; updates per-tile shadow cameras
- Methods: `init(builder)`, `update()`, `updateShadow(frame)`, `setup(builder)`, `dispose()`

#### Bayer (math)

- Function: `bayer16(uv)`; internal base64 texture, samples `ivec2(uv) % 16` for ordered dithering

#### Raymarching (utils)

- Function: `RaymarchingBox(steps, callback({ positionRay }))` sets up ray-box entry/exit and iterates calling callback per step.

#### Blur Helpers

- `boxBlur(textureNode, { size=int(1), separation=int(1), premultipliedAlpha=false })`
- `hashBlur(textureNode, bluramount=float(0.1), { repeats=float(45), premultipliedAlpha=false })`

---

### Complete Inventory: examples/jsm/tsl (Grouped)

#### display/

- AfterImageNode: Accumulates previous frame color for a trail/afterimage effect.
- AnaglyphPassNode: Left/right eye anaglyph compositing (red/cyan) from a single scene.
- AnamorphicNode: Horizontal glare/bloom stretch simulating anamorphic lens artifacts.
- BleachBypass: Filmic bleach-bypass color grade (high contrast desaturation).
- BloomNode: Multi-mip separable blur bloom with thresholding and tint per level.
- boxBlur: Simple box blur kernel utility pass.
- ChromaticAberrationNode: RGB channel offset along radial direction to mimic lens fringing.
- DenoiseNode: Edge-preserving spatial denoise filter for screen-space inputs.
- DepthOfFieldNode: Bokeh DOF with CoC near/far fields and multi-tap blur/composite.
- DotScreenNode: Halftone dot pattern overlay based on UV frequency.
- FilmNode: Film grain + scanline simulation with time-evolving noise.
- FXAANode: Fast approximate anti-aliasing in screen space.
- GaussianBlurNode: Gaussian blur node (configurable radius, separable passes).
- GTAONode: Ground Truth Ambient Occlusion approximating horizon-based AO in view space.
- hashBlur: Hash-based stochastic blur variant for lower-cost softening.
- LensflareNode: Screen-space lens flare sprites/ghosting based on bright sources.
- Lut3DNode: 3D LUT color grading from a LUT texture.
- MotionBlur: Velocity-buffer driven screen-space motion blur.
- OutlineNode: Edge outline pass using depth/normal discontinuities.
- ParallaxBarrierPassNode: Stereoscopic barrier pass for multi-view outputs.
- PixelationPassNode: Pixelation downsample/nearest filter effect.
- RGBShiftNode: Per-channel UV offset (static or animated) for chroma splitting.
- Sepia: Sepia tone color grade.
- SMAANode: Subpixel Morphological Anti-Aliasing.
- SobelOperatorNode: Sobel edge detection (grayscale or color edges).
- SSAAPassNode: Supersampled antialiasing (multi-sample resolve in post).
- SSGINode: Screen-Space Global Illumination approximation.
- SSRNode: Screen-Space Reflections with ray-march and fallbacks.
- StereoCompositePassNode: Composite stereo views into one output.
- StereoPassNode: Render stereo pair views/passes.
- TRAANode: Temporal Reprojection Anti-Aliasing.
- TransitionNode: Cross-fade/wipe/thresholded transitions between inputs.

#### lighting/

- TiledLightsNode: Screen-space tiled light culling and accumulation for many lights.

#### math/

- Bayer: Bayer matrix utilities for ordered dithering.

#### shadows/

- TileShadowNode: Tiled shadow rendering/accumulation for many shadow casters.
- TileShadowNodeHelper: Visual helper and utilities for tiled shadow grids.

#### utils/

- Raymarching: Utilities/snippets to build raymarch/isosurface nodes in TSL.

---

### Complete Inventory: src/nodes (Grouped with brief descriptions)

Below are the primary modules in `src/nodes`. Many are re-exported via `Nodes.js` and symbol surfaces via `TSL.js`.

#### accessors/

- AccessorsUtils: Helpers for creating/connecting accessor nodes.
- Arrays: Typed array helpers for node arrays/uniform arrays.
- BatchNode: Batches per-instance/per-object data as a node.
- Bitangent: Accessor node for geometric bitangent in different spaces.
- BufferAttributeNode: Exposes mesh `BufferAttribute` as node input.
- BufferNode: General GPU buffer node binding.
- BuiltinNode: Access to renderer-provided built-ins (time, frame id, etc.).
- Camera: Access camera matrices/properties as nodes.
- ClippingNode: Plane clipping values as nodes for material clipping.
- CubeTextureNode: Sample cube textures/environment maps.
- InstancedMeshNode: Instanced mesh attribute binding utilities.
- InstanceNode: Access per-instance transforms/attributes.
- Lights: Access aggregated light data as nodes.
- MaterialNode: Access material parameters as node inputs.
- MaterialProperties: Internal mapping of material properties to nodes.
- MaterialReferenceNode: Reference arbitrary material property by name/type.
- ModelNode: Model-space transform utilities as nodes.
- ModelViewProjectionNode: Combined MVP transform node.
- MorphNode: Access morph target data.
- Normal: Access normal in geometry/local/view/world spaces.
- Object3DNode: Access Object3D matrices, layers, userData.
- PointUVNode: UVs for point sprites/points material.
- Position: Position accessor in geometry/local/view/world spaces.
- ReferenceBaseNode: Base for referencing external JS values.
- ReferenceNode: Reference arbitrary object property with type safety.
- ReflectVector: Reflection vector computation node.
- RendererReferenceNode: Reference renderer state (tone mapping, DPR, etc.).
- SceneNode: Access Scene-level data as node.
- SkinningNode: Skinning matrices and transforms for skinned meshes.
- StorageBufferNode: Bind storage buffer for compute/fragment access.
- StorageTextureNode: Bind storage texture for read/write.
- Tangent: Access tangent in various spaces.
- TangentUtils: Helpers related to tangent/bitangent computation.
- Texture3DNode: 3D texture sampling node.
- TextureBicubic: Bicubic sampling helper for smoother sampling.
- TextureNode: 2D texture sampling node.
- TextureSizeNode: Query texture size at mip level.
- UniformArrayNode: Uniform arrays as node inputs.
- UserDataNode: Access Object3D `userData` fields as nodes.
- UV: UV coordinates accessor.
- VelocityNode: Per-vertex or per-pixel velocity vectors.
- VertexColorNode: Vertex color attribute accessor.

#### code/

- CodeNode: Embed raw code chunks in graphs.
- ExpressionNode: Build expressions programmatically into nodes.
- FunctionCallNode: Call node-defined functions with typed arguments.
- FunctionNode: Define TSL/WGSL/GLSL functions as node objects.
- ScriptableNode: Build nodes procedurally from JS callbacks.
- ScriptableValueNode: Scriptable value node for dynamic data.

#### core/

- ArrayNode: Node-typed arrays (of scalars/vectors)
- AssignNode: Assign values between node vars.
- AttributeNode: Vertex attributes exposure.
- BypassNode: Node that forwards value while enabling side-effects/taps.
- CacheNode: Caches subgraph results between passes.
- constants: Numeric and enum constants.
- ConstNode: Compile-time constants.
- ContextNode: Switch context/scopes for subgraphs.
- IndexNode: Primitive index, draw instance index access.
- InputNode: Generic typed input node base.
- LightingModel: Base class for lighting models.
- MRTNode: Multi Render Target node for named outputs.
- Node: Base node class.
- NodeAttribute: Metadata for attributes.
- NodeBuilder: Orchestrates shader building from graphs.
- NodeCache: Graph-level caching store.
- NodeCode: Holds emitted code per stage.
- NodeFrame: Per-frame state for node evaluation.
- NodeFunction: Typed function representation for nodes.
- NodeFunctionInput: Typed inputs for node functions.
- NodeParser: Parse node graphs.
- NodeUniform: Uniform binding wrapper.
- NodeUtils: Utilities for graph transformations.
- NodeVar: Local variable node representation.
- NodeVarying: Varyings between vertex/fragment.
- OutputStructNode: Aggregate multiple outputs as a struct.
- ParameterNode: Parameter wrapper for functions.
- PropertyNode: Bind material/renderer/property as node.
- StackNode: Execution stack frame helpers.
- StructNode: Struct declarations.
- StructType: Struct type definition.
- StructTypeNode: Struct type as node.
- SubBuildNode: Build subgraphs in isolation.
- TempNode: Base for effect nodes with render/update hooks.
- UniformGroupNode: Group uniforms together (UBOs-like).
- UniformNode: Single uniform value.
- VarNode: Local variable node.
- VaryingNode: Varying declaration node.

#### display/

- BlendModes: Common blend ops (screen, overlay, burn, dodge...).
- BumpMapNode: Derive bump normal perturbation from height map.
- ColorAdjustment: Hue/saturation/brightness/contrast/vibrance nodes.
- ColorSpaceFunctions: Helpers for linear/sRGB/ACES/AGX conversions.
- ColorSpaceNode: Convert between color spaces in graph.
- FrontFacingNode: Boolean front-facing fragment.
- NormalMapNode: Tangent-space normal mapping.
- PassNode: Render scene/camera to textures for post.
- PosterizeNode: Quantize colors to posterized bands.
- RenderOutputNode: Route named MRT outputs.
- ScreenNode: Screen-space coordinates and utilities.
- ToneMappingFunctions: Tone mapping math helpers.
- ToneMappingNode: Apply selected tone mapping curve.
- ToonOutlinePassNode: Outline rendering pass for toon shading.
- ViewportDepthNode: Depth at viewport.
- ViewportDepthTextureNode: Bind viewport depth texture.
- ViewportSharedTextureNode: Shared intermediate texture access.
- ViewportTextureNode: Bind the current framebuffer as texture.

#### fog/

- Fog: Density/range fog factors as nodes.

#### functions/

- BasicLightingModel: Simple direct lighting model.
- BSDF/BRDF_GGX: Microfacet GGX BRDF.
- BSDF/BRDF_Lambert: Diffuse Lambert BRDF.
- BSDF/BRDF_Sheen: Fabric sheen lobe.
- BSDF/D_GGX: GGX normal distribution function.
- BSDF/D_GGX_Anisotropic: Anisotropic variant of D_GGX.
- BSDF/DFGApprox: Split-sum preintegrated specular approximation.
- BSDF/EnvironmentBRDF: Image-based lighting BRDF term.
- BSDF/F_Schlick: Fresnel Schlick approximation.
- BSDF/LTC: Linearly transformed cosines for area lights.
- BSDF/Schlick_to_F0: Convert Schlick to F0 reflectance.
- BSDF/V_GGX_SmithCorrelated: Masking/Shadowing term.
- BSDF/V_GGX_SmithCorrelated_Anisotropic: Anisotropic variant.
- material/getAlphaHashThreshold: Alpha hash cutout threshold.
- material/getGeometryRoughness: Geometry roughness term.
- material/getParallaxCorrectNormal: Parallax-corrected normal mapping.
- material/getRoughness: Effective roughness term.
- material/getShIrradianceAt: Spherical harmonics irradiance lookup.
- PhongLightingModel: Classic Phong/Blinn-Phong.
- PhysicalLightingModel: PBR physical with IBL support.
- ShadowMaskModel: Screen-space shadow mask composition.
- ToonLightingModel: Stylized toon lighting.
- VolumetricLightingModel: Volumetric light scattering model.

#### geometry/

- RangeNode: Generate linear ranges, ramps.

#### gpgpu/

- AtomicFunctionNode: Atomic ops on buffers.
- BarrierNode: Workgroup/barrier sync.
- ComputeBuiltinNode: Built-in variables for compute.
- ComputeNode: Define compute passes/kernels.
- SubgroupFunctionNode: Subgroup (wave) intrinsics.
- WorkgroupInfoNode: Workgroup dimensions/ids.

#### lighting/

- AmbientLightNode: Ambient light contribution.
- AnalyticLightNode: Common base for direct lights.
- AONode: Ambient occlusion factor node.
- BasicEnvironmentNode: Simple environment lighting.
- BasicLightMapNode: Lightmap contribution.
- DirectionalLightNode: Directional light shading.
- EnvironmentNode: Environment map sampling.
- HemisphereLightNode: Hemispheric ambient light.
- IESSpotLightNode: IES-profile spot light.
- IrradianceNode: Diffuse irradiance from environment.
- LightingContextNode: Shared lighting state container.
- LightingNode: Aggregate lighting evaluation.
- LightProbeNode: Light probe sampling.
- LightsNode: Aggregates scene lights.
- LightUtils: Helpers for shadowing/attenuation.
- PointLightNode: Point light shading.
- PointShadowNode: Point light shadow sampling.
- ProjectorLightNode: Textured projector light.
- RectAreaLightNode: Rect area light (LTC-based).
- ShadowBaseNode: Base for shadow sampling nodes.
- ShadowFilterNode: Shadow filtering (PCF/VSM/etc.).
- ShadowNode: Sample shadows for a given light.
- SpotLightNode: Spot light shading.

#### materialx/

- MaterialXNodes: MaterialX node library bindings.
- lib/mx_hsv: HSV utilities.
- lib/mx_noise: Noise functions.
- lib/mx_transform_color: Color transforms.

#### math/

- BitcastNode: Bit-level reinterpret casts.
- ConditionalNode: Branching/conditions.
- Hash: Hash functions for noise/stochastic.
- MathNode: Arithmetic composition node.
- MathUtils: Math helpers for TSL.
- OperatorNode: Functional operators on nodes.
- TriNoise3D: 3D triangular noise function.

#### parsers/

- GLSLNodeFunction: Wrap GLSL functions as nodes.
- GLSLNodeParser: Parse GLSL into node graphs.

#### pmrem/

- PMREMNode: Prefiltered env map generation as node.
- PMREMUtils: PMREM helper utilities.

#### procedural/

- Checker: Procedural checker pattern.

#### shapes/

- Shapes: Primitives for analytic shapes in nodes.

---

### BSDF and Material Functions

Available in `src/nodes/functions/*` and re-exported via `TSL.js`:

- BSDF: `BRDF_GGX`, `BRDF_Lambert`, `D_GGX`, `DFGApprox`, `F_Schlick`, `Schlick_to_F0`, `V_GGX_SmithCorrelated`, plus anisotropic/clearcoat variants.
- Material helpers: `getGeometryRoughness`, `getParallaxCorrectNormal`, `getRoughness`, `getShIrradianceAt`, alpha hash thresholds, etc.
- Lighting models: `BasicLightingModel`, `PhongLightingModel`, `PhysicalLightingModel`, `ToonLightingModel`, `ShadowMaskModel`, `VolumetricLightingModel` (plug into materials’ nodes).

Usage in a PBR material:

```js
import { materialColor, roughness, metalness, BRDF_GGX, F_Schlick } from 'three/tsl';
mat.colorNode = materialColor; // baseColor
// Advanced: craft your own BRDF term and feed into lighting nodes
```

---

### Parsers (GLSL) and TSL Base

- `GLSLNodeParser`, `GLSLNodeFunction`: Utilities to ingest GLSL-like source into node graphs. Prefer TSL with WGSL for WebGPU.
- `tsl/TSLBase`, `tsl/TSLCore`: Foundations of the TSL runtime and integration into the node system.

---

### PMREM and Environment

- `PMREMNode`, `PMREMUtils`: For environment map prefiltering as nodes, usable in PBR pipelines and IBL.

---

### Patterns and Best Practices

- Prefer node assignment on standard materials (`MeshStandardMaterial`, `MeshPhysicalMaterial`) using `*.Node` properties.
- Isolate post-processing into `TempNode` classes that render to `RenderTarget`s; expose a `getTextureNode()` or `passTexture(this, rt)` for composition.
- Keep TSL functions pure; declare layouts for complex ones with `.setLayout({ name, type, inputs })`.
- For multi-pass effects, share builder contexts: `.context( builder.getSharedContext() )` to reduce recompiles.
- Use `Loop`, `If`, `Break` judiciously for performance; prefer vectorized operations when possible.
- When MRT is available, route semantic outputs (e.g., `output`, `normal`, `emissive`) using `mrt({ ... })` and fetch via `getTextureNode(key)`.

---

### Distribution Builds

- `build/three.tsl.js`: Re-exports the full TSL surface (constructors, ops, helpers). Import from `'three/tsl'` in apps.
- `build/three.webgpu.nodes.js`: Re-exports nodes/material integrations from `'three/webgpu'` entry. Use this for WebGPU renderer, node materials, and post-processing scaffolding.

Excerpt (TSL massive export pattern):

```1:40:c:\Users\ARTDESKTOP\Desktop\CODE\.aug\flowv1\codexv\three.js-dev\three.js-dev\build\three.tsl.js
import { TSL } from 'three/webgpu';
const BRDF_GGX = TSL.BRDF_GGX;
const BRDF_Lambert = TSL.BRDF_Lambert;
// ...
export { BRDF_GGX, BRDF_Lambert, /* ... */ };
```

---

### Cross-Reference: Aggregated Exports

- High-level node classes (default exports) are aggregated in `src/nodes/Nodes.js` for convenient imports.

```1:30:c:\Users\ARTDESKTOP\Desktop\CODE\.aug\flowv1\codexv\three.js-dev\three.js-dev\src\nodes\Nodes.js
// constants
export * from './core/constants.js';
// core
export { default as ArrayNode } from './core/ArrayNode.js';
// ... more node exports ...
```

- The TSL symbol surface is aggregated in `src/nodes/TSL.js` (and built in `three.tsl.js`).

```1:36:c:\Users\ARTDESKTOP\Desktop\CODE\.aug\flowv1\codexv\three.js-dev\three.js-dev\src\nodes\TSL.js
// constants
export * from './core/constants.js';
// math
export * from './math/BitcastNode.js';
// ... extensive re-exports of accessors/display/utils/functions ...
```

---

### Troubleshooting

- If a node-based material shows black/NaN, check TSL graph outputs for valid ranges and ensure proper color space conversions.
- For depth-based effects (SSAO/GTAO/DOF), ensure correct camera near/far and depth encoding (logarithmic vs perspective). Use helpers like `logarithmicDepthToViewZ` and `viewZToPerspectiveDepth`.
- Multi-pass nodes must set sizes every frame to match the drawing buffer or source textures.

---

This reference is derived directly from the code under `src/nodes`, `src/renderers/webgpu`, and `examples/jsm/tsl`, and aligns with the distribution builds. For details or edge cases, open the specific file listed above and inspect `constructor`, `setup(builder)`, and the exported helper function.


