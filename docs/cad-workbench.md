# Unified CadWorkbench

## Ownership

Both the project Model tab and /chili-editor render components/cad/cad-workbench.tsx.
The old ChiliEditor export is a compatibility alias, not a second implementation.
The workbench owns the engine iframe, tool registry, inspector visibility, import/save
state and the engine's command/selection snapshot. Review/file navigation hides the
workbench without unmounting it, preserving the live document and camera.

## Visual contract

public/cad-workbench.css is the single source for workbench tokens and layout.
Next bundles it through app/chili-editor.css; the engine loads the same asset.
It maps app/design-tokens.css workspace tokens to surfaces, font, borders, focus and selection colors in both the
React controls and Chili3D theme variables. No new fonts, animation libraries or
low-level primitives were introduced.
The host resolves the tokens and sends a same-origin `set-theme` snapshot after
engine readiness and on system/explicit theme changes. The engine accepts only
the named CAD tokens; it does not receive arbitrary CSS or duplicate app palettes.

Visual thesis: quiet desktop modeling workspace with a full-canvas working surface.
Content: compact menus, contextual actions, canvas, optional right inspector,
native operation parameters and status/snapping. No standalone marketing sidebar.
Interaction: immediate menu feedback, real command cancellation, persistent document;
no ornamental movement. UI UX Pro Max's shadcn token guidance and Apple/frontend
restraint informed these choices.

## Components and exceptions

Registry Button, DropdownMenu, Input, Popover and Tooltip compose the host tools.
All registered non-AI/non-WeChat commands remain accessible in menus/search.
Selection switches quick actions from creation to modification.
Save to Project is unavailable without a project.

The native geometry tree, property editors, command parameter inputs, camera gizmo
and snapping controls remain engine-owned, with the shared theme applied. These
specialized controls preserve Chili3D behavior; they have NOT all been rewritten
as shadcn widgets. This exception avoids replacing geometry-aware controls with
incomplete lookalikes. The iframe remains an engine boundary, not a separate route.

## Bridge contract

workbench-state contains activeCommand, canCancel, selectedCount.
Application property and selection signals emit snapshots; no polling.
cancel-command invokes the active engine command's cancel method.
Existing commands, STEP import, mesh preview and revision-save messages remain.
Revision saves use `/api/projects/:slug/chili-import` with `parentRevisionId`;
the removed `viewport-save` URL must not be reintroduced by the client.
Listeners validate same origin and exact parent/frame source.
Selection listeners are rebound on document changes and removed on shutdown.

## Acceptance checklist

- [x] Both routes use CadWorkbench.
- [x] One stylesheet supplies host/engine theme tokens.
- [x] Standalone marketing/sidebar shell removed.
- [x] Native object/property inspector on the right.
- [x] Contextual tools use engine selection state.
- [x] Active command and cancellation use real engine state.
- [x] Project tab changes retain the workbench.
- [x] Production build and type checking.
- [x] Playwright real command activation and cancellation.
- [x] September 25: reconcile the updated composer's mode API and wire Stop to cancellation.
- [x] September 25: production build, import finalization/provenance tests, responsive contract.
- [x] September 25: Playwright layout measurements at 1440×900, 768×1024, 375×812 and 844×390 (no page overflow).
- [x] September 25: explicit light/dark host-engine theme synchronization, tool search, reduced-motion and command cancellation.
- [x] September 25: narrow inspector overlays the right side without resizing the canvas; isolated viewport stacking keeps gizmos behind the inspector.
- [x] September 25: Playwright mocked save receives STEP and parentRevisionId at chili-import and displays the returned revision. No real project data changed in this check.
- [ ] Reverify authenticated project editing/export end to end against the newer revision backend.
- [ ] Exhaustive testing of all geometry commands and project save/export workflows.

Full replacement of native engineering widgets is not claimed by this refactor.
