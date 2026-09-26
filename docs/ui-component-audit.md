# UI component audit — 2026-09-20

## Scope and method

Inspected all ten page entry points and app-owned TSX compositions in app/ and components/, including JSX controls and component imports. Inspected registry aliases, shared primitives, the Chili3D command bridge and viewport CSS. This is a source audit of the entire app, not a claim that every authenticated workflow was browser-tested.

Plain layout elements, headings, links, canvas, iframe and rendered document content are not automatically violations. Native interactive primitives replacing an available registry component are violations. Generated components themselves necessarily contain native HTML.

## Route coverage

| Route | Findings |
| --- | --- |
| / | Registry Buttons are used, but hero, navigation and final CTA wrap Buttons inside links; use Button asChild with Link instead. Other sections are semantic content, not missing primitives. |
| /sign-in, /sign-up | Shared auth-form.tsx uses raw inputs and labels; migrate to Input and Label/Field. Button already reused. |
| /projects | Registry Buttons, but repeated Link wrapping Button. Project rows are ordinary navigation links, which are appropriate. |
| /projects/new | new-project.tsx uses raw input; use Input and Label/Field. Submission is click-only rather than form submission. |
| /projects/[slug] | Most significant gaps: custom workspace tabs, pointer-only resizer, native starter buttons, composer textarea/selects. Marker and Magic UI file tree are already used. See priority list below. |
| /chili-editor | This change replaces the icon Dock with registry Button/DropdownMenu/Input/Popover compositions. The embedded renderer uses the same component. Native CAD-specific controls remain an explicit exception below. |
| /p/[slug] | Primarily semantic published content and artifact links; no alternative custom button/dialog system identified. Markdown tables are content, not a data-grid implementation. |
| /u/[username] | Primarily semantic profile content and project links; no competing interactive primitive identified. |
| /studio | Redirect only; no UI to migrate. |

## Remaining component-policy gaps

| Priority | Source | Current behavior | Registry replacement |
| --- | --- | --- | --- |
| High | components/projects/project-workspace.tsx | Native tab buttons and custom tab state/semantics | Tabs; retain feature-level dynamic file tabs |
| High | components/projects/project-workspace.tsx | Pointer-only resize button | Resizable panels/handle, with keyboard support |
| High | components/projects/agent-composer.tsx | Native textarea and mode/model selects | Textarea/Input Group and Select or Native Select |
| Medium | components/auth/auth-form.tsx | Three raw input variants and labels | Input and Label/Field |
| Medium | components/projects/new-project.tsx | Raw name input, click-only submission | Input, Label/Field, semantic form |
| Medium | components/projects/project-workspace.tsx | Two native starter buttons | Existing Button |
| Medium | components/landing/hero.tsx, landing-nav.tsx, final-cta.tsx; app/projects/page.tsx | Nested interactive Link > Button | Existing Button asChild > Link |
| Low/legacy | components/cad/cad-demo.tsx | Native model-switch buttons | Toggle Group or Button; no current imports of CadDemo found |
| Convention | components/magicui/button.tsx, marker.tsx, accordion.tsx, scroll-area.tsx | Imports cn from separate cn package | Existing @/lib/utils helper; preserve generated APIs |

The new Input, DropdownMenu and Popover use the project helper. Their generated behavior is otherwise preserved. The hidden file input is an implementation detail, but the attachment interaction is not complete (below).

## Functional issues discovered during the audit

- AgentComposer's file picker stores only a filename; it does not send file contents with the request.
- Its model selector changes local state, not the execution model.
- Its busy square is a disabled submit button, not a working cancel action.
- Workspace Share and Add workspace view buttons have no handlers.
- Workspace resizing does not provide a keyboard handler.
- The unused CadDemo reports “Valid solid” independently of build state and has disabled export controls.

These are reported, not silently treated as fixed by the viewport work. Fix wiring before cosmetic migration so the UI remains truthful.

## Viewport implementation and exception record

- Removed the long icon-only Dock from ChiliEditor. File, Edit, Create, Sketch, Constraints, Modify, Inspect, View and Other menus enumerate the runtime command registry.
- Search and quick actions invoke actual Chili3D commands. Unknown command families remain accessible under Other.
- Only AI and WeChat command families are omitted. The old substring filter also hid valid constraint/repair names.
- Command names use Chili3D translations. Native camera controls remain in the scene.
- Object/property inspectors can be opened without restoring Chili3D's AI assistant or ribbon.
- Restored native command instructions and snapping controls that the old renderer CSS hid, including a horizontally scrollable snap row on narrow viewports.
- Toolbar occupies normal layout space; the canvas fills the remaining scene area.
- Host/iframe messages verify both origin and source.

ViewportTools is a feature composition, not a new primitive. Chili3D canvas, gizmo, geometric property editors, selection dialogs and command prompts are retained as CAD-engine integration UI: shadcn/Magic UI do not supply their geometry behavior. This is an explicit exception, not a claim that all embedded Chili3D internals use shadcn. Porting those internals would be a separate, larger feature-parity project.

Registry command exposure is not equivalent to certifying every command's geometry workflow. Individual tool prerequisites and capabilities still belong to Chili3D.

## Verification performed

- TypeScript no-emit check and production build passed; git diff whitespace check passed.
- Playwright verified all nine menus: File 7, Edit 2, Create 30, Sketch 9, Constraints 13, Modify 41, Inspect 3, View 5, Other 7 (117 commands total).
- Search found Repair Shape and all 13 constraint entries. Escape dismissed search and restored focus to Find tool.
- Invoked Create > Box in a disposable empty editor; the real Chili3D command executed. No project or generated revision was modified.
- Verified object/property panels at 240px and the remaining renderer at 613px wide.
- Inspected screenshots at 1280px desktop and 390px mobile with reduced motion. Mobile document width matched the viewport; status content height matched its scroll height after the clipping fix.
- Browser reported no console errors in the final checks. Existing Chili3D initialization and WebGL performance warnings remain.
- Evidence: output/playwright/viewport-desktop-final.png and viewport-mobile-final.png. The desktop screenshot predates the final expanded status row.
- Browser coverage was the shared ChiliEditor on /chili-editor, not an authenticated project run. Full geometry editing/export, every native command and project-save authorization were not exhaustively tested.

## Design rationale and follow-up order

Apple-design/frontend guidance informed restrained neutral controls, stable spatial placement, readable menu names and progressive disclosure rather than decorative animation.

1. Wire or remove inert composer/workspace actions.
2. Migrate workspace tabs, resize handles and composer controls.
3. Migrate authentication and project-creation inputs.
4. Correct nested links/buttons and consolidate cn imports.
5. Remove unused demo code or make its status truthful.

Component availability checked against the official [shadcn component index](https://ui.shadcn.com/docs/components), including Tabs, Resizable, Select, Textarea, Input Group, DropdownMenu and Popover, plus the local components/magicui inventory.
