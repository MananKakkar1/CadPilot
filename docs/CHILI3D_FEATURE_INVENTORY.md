# Chili3D integration inventory

Pinned upstream source: `xiangechen/chili3d` at `03a6a542e841a7f1952f67aa729e0658a8096c08`.

The source audit was performed from the pinned repository, not from the compiled `public/chili3d` output. The repository contains the full upstream application packages; CadPilot currently consumes the reproducible production build and a project-owned runtime plugin while the deeper renderer port is staged.

| Upstream area | Source boundary | Current CadPilot surface | Status |
| --- | --- | --- | --- |
| Renderer and Three.js view | `packages/web`, `packages/builder`, `packages/core` | Embedded Chili3D production renderer in the project inspector | Partial: iframe boundary remains |
| OCCT/WASM and data exchange | `packages/builder/src/defaultDataExchange.ts`, `packages/core/src/dataExchange.ts` | STEP import/export bridge | Partial: preview-first adapter missing |
| Document/model tree | `packages/app/src/document.ts`, `packages/core/src/model*` | Available inside embedded Chili3D surface | Partial: not exposed as project inspector data |
| Selection and camera | `packages/app/src/selectionManager.ts`, `packages/core/src/navigation.ts` | Available in Chili3D renderer | Partial: no shared React viewport state |
| Command registry | `packages/core/src/command`, `packages/app/src/commands` | Upstream ribbon plus one Agentic CAD bridge command | Partial: Dock is not yet registry-backed |
| Sketch creation/editing | `packages/app/src/commands/create`, `packages/app/src/commands/modify` | Generated SVG/DXF sketch artifacts | Missing parity in project Dock |
| Solid/boolean/modify tools | `packages/app/src/commands/boolean.ts`, `commands/modify` | Available in embedded upstream UI | Partial: not surfaced through Agentic CAD Dock |
| Measure/inspect | `packages/app/src/commands/measure`, `packages/app/src/commands/checkShape.ts` | Dock placeholders plus upstream tools | Partial: placeholders need command wiring |
| Import/export | `packages/app/src/commands/importExport.ts` | STEP bridge and artifact downloads | Partial: explicit viewport adapter missing |
| Undo/redo/history | `packages/app/src/commands/undo.ts`, `redo.ts`, `packages/core/src/foundation/history.ts` | Available in embedded renderer | Partial: save/revision boundary not integrated |
| Agent package | `packages/ai/src` | Not copied into CadPilot; CadPilot owns its own agent model | Deliberate boundary |
| Plugin system | `packages/app/src/pluginManager.ts`, `packages/core/src/plugin` | `agentic-cad-bridge` runtime plugin | Done for current bridge |

## Required next parity work

- [ ] Build an explicit client-only `CadViewportAdapter` around the Chili3D runtime boundary.
- [ ] Stream preview mesh into the viewport before STEP import.
- [ ] Expose command metadata from the pinned Chili3D command registry to the Magic UI Dock.
- [ ] Forward camera, selection, document-ready, import, export, and save events to the agent run stream.
- [ ] Save Chili3D exports as derived revisions through a project-scoped viewport-save endpoint.
- [ ] Add a generated command inventory test so upstream command additions do not silently disappear.
- [ ] Keep `public/chili3d/CHILI3D_NOTICE.md`, `LICENSE`, pinned commit, and rebuild script synchronized.
