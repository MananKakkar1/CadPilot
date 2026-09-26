# CadPilot website audit

24 September 2026 · Current working tree · Visual design, navigation, content, interaction, accessibility, and responsive behavior

## Verdict

The site has individual pieces worth preserving, but it does not yet feel like one finished product. The landing page repeatedly describes the same benefit, utility pages borrow oversized marketing styling, project management lacks a coherent application shell, and the most important public-facing page does not display the CAD model. Several visible actions imply functionality that is not wired through.

The redesign needs a common visual language and complete page journeys. Changing colors or adding more animated components would leave the main weaknesses intact.

This audit extends the [platform target-state report](/home/manan/CadPilot/docs/PLATFORM_TARGET_STATE.md) with a page-specific website critique. It is an expert review, not a customer usability study or a certified accessibility assessment. Recommendations are hypotheses to validate, and severity indicates task impact rather than a numerical design score.

Evidence labels: **Source** means verified in the current component/route/styles; **Live** means inspected in the running browser; **Screenshot** means an existing capture whose current behavior was not established. A visual observation does not establish backend correctness. Browser-agent work is delegated to a lightweight `gpt-5.6-luna` subagent under the user's browser delegation preference.

### Inspection coverage and visual evidence

The current audit used a live desktop viewport of **1260×634**. The subagent started the existing development server and stopped it after inspection. No application code, accounts, designs, or builds were changed.

| Surface | Coverage and evidence |
|---|---|
| Landing | Live page and scroll inspection; reported height approximately 5090 px. [Hero](/home/manan/browser-agent/artifacts/states/20260924T184954-916/screenshot.png), [lower proof section](/home/manan/browser-agent/artifacts/screenshots/shot-20260924T185129-933.png), [final CTA/footer](/home/manan/browser-agent/artifacts/screenshots/shot-20260924T185146-063.png) |
| Sign-in | Live. [Capture](/home/manan/browser-agent/artifacts/screenshots/shot-20260924T185054-284.png) shows a large two-line heading and deep card; button and account-switch link are visible, but the card extends beyond the viewport |
| Sign-up | Live. [Capture](/home/manan/browser-agent/artifacts/screenshots/shot-20260924T185056-779.png) shows the primary button beginning at the bottom edge; the heading, copy, and spacing consume substantial vertical room |
| New project | Live, anonymously reachable. [Capture](/home/manan/browser-agent/artifacts/screenshots/shot-20260924T185059-515.png) confirms a standalone card without back/home/account navigation |
| Projects | Navigation attempted, but no settled screenshot/state demonstrating the expected signed-out page was returned. Assessments use current source; blank text from that attempt is not evidence of an authentication gate or a confirmed rendering defect |
| Editor | Current attempt was inconclusive; a successful live [editor/search capture from the immediately preceding review](/home/manan/browser-agent/artifacts/screenshots/shot-20260924T184639-607.png) provides visual evidence. The current route source does not require authentication |
| Private workspace | Source review. Authenticated live editing states were not reached or fabricated |
| Public project/profile | Source review. No real public slug or username was discoverable from the inspected pages |
| Mobile | Not live-tested in this pass: browser-agent's inspected CLI did not expose viewport resizing. [Existing 390×844 editor capture](/home/manan/CadPilot/output/playwright/unified-workbench-mobile.png) is historical evidence only |

The browser subagent reported no horizontal overflow on its reachable desktop pages. This is not a mobile result. No production Lighthouse, Core Web Vitals, automated contrast, or screen-reader audit was performed. Do not interpret apparent contrast or DOM order as a verified accessibility pass.

The subagent initially suggested missing autocomplete and auth gating for the editor. These interpretations were rejected after checking source: AuthForm already supplies autocomplete attributes, and the standalone editor accepts absent project context. Runtime initialization warnings were reported but were not traced to a reproducible user-facing failure, so they are not ranked as confirmed bugs.

## Systemic problems

### 1. The visual language changes between pages

The landing page uses “Agentic CAD,” a supplied logo, large editorial type, violet actions, and colorful model stages. Authentication uses a different star-like mark and large card headings. The editor says “CadPilot,” uses a restrained desktop-tool treatment, and shifts the action/selection blue. Project pages have their own sparse layout. The manifest still uses a near-black theme color while the active surfaces are light.

**Source:** [Landing navigation](/home/manan/CadPilot/components/landing/landing-nav.tsx), [authentication](/home/manan/CadPilot/components/auth/auth-form.tsx), [editor](/home/manan/CadPilot/app/chili-editor/page.tsx), [manifest](/home/manan/CadPilot/app/manifest.ts), [workbench tokens](/home/manan/CadPilot/public/cad-workbench.css).

Choose one product name and logo, one semantic token vocabulary, one type scale, and shared control states. Marketing can remain more expressive than modeling, but users should recognize the same product on every route. Use CadPilot as the working name until the owner decides otherwise.

### 2. The site describes engineering credibility more often than it demonstrates it

Phrases such as “The output is a system,” “Continue your design practice,” “TEAM READY,” and “exposes every decision” are abstract or stronger than the current interface demonstrates. Users need to see a dimensioned input, the actual model, an edit, and the resulting export. Volume and surface area alone do not prove that the part meets the brief.

Replace broad assertions with concrete examples and observable capabilities. Label conceptual or illustrative material. Avoid invented testimonials, customer logos, accuracy claims, or speed claims.

### 3. Styling is accumulated rather than governed

[Root layout](/home/manan/CadPilot/app/layout.tsx) loads eleven project stylesheets plus KaTeX. [Reference CSS](/home/manan/CadPilot/app/reference.css) contains successive dark, light, monochrome, and accent treatments of the same selectors. [UI quality CSS](/home/manan/CadPilot/app/ui-quality.css) retains successive three-panel, resizable-inspector, and two-panel workspace definitions.

The presence of multiple stylesheets is not itself a defect. Repeated ownership of the same component's geometry and colors is the maintenance problem: a local correction can be defeated by another global override.

Consolidate around tokens and scoped marketing, account, project, and workbench layouts. Preserve existing Magic UI/shadcn APIs and use their variants. Do not create a second component library. Remove obsolete overrides only after mapping consumers and comparing rendered states.

### 4. Page hierarchy is weak outside the landing page

Projects, project creation, and public pages lack a consistent way to orient the user, access their account, and return to related work. Each is treated as a standalone content block. Error, empty, signed-out, and loading states need the same care as the ideal state.

Use a compact application header with brand/home, Projects, current project where relevant, and account controls. The full-screen editor can have a denser header. Public pages need a public header and a clear path back to the product, without exposing private navigation.

## Page-by-page audit and redesign brief

| Page | Assessment from current source | Priority |
|---|---|---|
| `/` | Polished fragments, repetitive evidence, weak product demonstration, inconsistent entry flow | P1 |
| `/sign-in` | Overwritten heading, oversized presentation, missing recovery, fragile return flow | P1 |
| `/sign-up` | Too much product language for a small form; unnecessary upfront identity friction | P1 |
| `/projects` | Bare list rather than a useful model library; disconnected signed-out state | P1 |
| `/projects/new` | Asks for administration before design; unauthenticated form leads to a rejected API request | P0 |
| `/projects/[slug]` | Canvas competes with conversation; incomplete controls and fragile states; likely mobile grid conflict | P0 |
| `/chili-editor` | Most coherent functional visual direction; weak blank state and command naming | P1 |
| `/p/[slug]` | Public project displays text and revision status but no model | P0 |
| `/u/[username]` | Thin profile without project imagery or empty-state guidance | P2 |
| `/studio` | Redirect only; not a distinct experience to redesign | Verify destination journey |

P0: core task or promise is blocked/broken. P1: materially harms understanding or routine use. P2: polish/discovery improvements after the core journey works.

### Landing page `/`

**What works:** a recognizable primary CTA, an actual geometry component, a legible high-level headline, and identifiable section anchors. Preserve the product-led ambition and the existing geometry infrastructure.

**What weakens it:**

- The same spur gear is used in Hero, ProductSurface, Workflow, and ProofSection. Four large stages do not provide four distinct pieces of evidence.
- The section labeled “THE WORKSPACE” shows another isolated model, not the actual editing interface. This misses the chance to demonstrate why the product is useful.
- “Models” is an anchor to a single repeated example, not a useful model collection. The label promises a broader destination.
- The hero prioritizes engine names and spaced uppercase labels before explaining the tangible output and current limitations.
- “Open projects,” “Start a project,” and the signed-out experience do not form one clear onboarding path. The primary creation link goes to a form that does not gate authentication.
- The footer provides a logo, slogan, and copyright, but no help/contact path or other useful navigation. Add genuine destinations as they exist, not placeholder links.
- The workflow and proof sections repeat the same claims about solids, decisions, and iteration with little new information.

**Source:** [Page composition](/home/manan/CadPilot/app/page.tsx), [Hero](/home/manan/CadPilot/components/landing/hero.tsx), [ProductSurface](/home/manan/CadPilot/components/landing/product-surface.tsx), [Workflow](/home/manan/CadPilot/components/landing/workflow.tsx), [ProofSection](/home/manan/CadPilot/components/landing/proof-section.tsx), [capability claims](/home/manan/CadPilot/components/landing/landing-signals.tsx).

**Redesign:** use five purposeful sections: a concrete promise with a real part; a short actual-workspace demonstration; three distinct supported use cases; explicit edit/export capabilities and limits; a final CTA and useful footer. Show the model and enough of its editing context in the first desktop screen. Let the remainder explain the workflow rather than repeating the hero.

Suggested hero direction: **“Describe a part. Keep control of every dimension.”** Supporting copy should name the actually supported edit and export workflow. This is proposed positioning; do not publish the dimension-control promise until that workflow works. A more conservative current statement is **“Turn a part description into CAD you can inspect and refine.”**

Primary action: “Start a design.” Secondary: “Explore an example.” The example should be a real, read-only model with visible dimensions and a working route. Show the difference between prompt, accepted result, and subsequent edit. Do not manufacture a simulated “live” workflow that users cannot perform.

### Sign-in `/sign-in`

**Source observations:** the headline is “Continue your design practice”; the card heading can reach 54 px with very tight tracking. There is no password reveal or recovery link. Switching to sign-up drops `nextPath`. Submission has no exception recovery around `fetch`, so a network error can leave the form pending. Labels and autocomplete are present and worth preserving.

**Source:** [AuthForm](/home/manan/CadPilot/components/auth/auth-form.tsx), [auth styles](/home/manan/CadPilot/app/auth.css).

**Redesign:** a compact 400–440 px form with “Sign in to CadPilot,” a short contextual return message if appropriate, email, password/reveal, recovery, and one primary action. Use a 28–32 px heading. Keep brand navigation visible without competing with the form. Preserve the intended destination through the sign-in/sign-up switch and normalize it to an allowed internal path.

Errors should be specific, associated with the relevant fields where possible, and recoverable without losing input. A connection failure should restore the button and state what to try next. A recovery link requires a working recovery flow; do not add a dead link just for visual completeness.

### Sign-up `/sign-up`

**Source observations:** the form introduces BREP revisions and engineering records before the user has a design. Username is required immediately, with only a placeholder and length attributes rather than a clear explanation of its public use. The same oversized card pattern is reused.

**Redesign:** “Create your account,” a brief privacy/project ownership statement that matches actual behavior, email and password, and concise requirements. Defer public username choice if the data model/product can support that change; otherwise explain allowed characters and why it is required. Keep a saved design intent across account creation. Provide real terms/privacy links when those policies are implemented and published.

Do not add social providers as decorative options unless they actually work. Prefer a complete, restrained form over a visually richer collection of incomplete choices.

### Project library `/projects`

**Source observations:** authenticated rows show title, generic summary, revision count, and visibility. There is no model thumbnail, last activity, recent run state, search, sorting control, archive action, or account navigation. The signed-out state is a separate bare block. This is workable scaffolding, not a useful library for returning users.

**Source:** [Projects page](/home/manan/CadPilot/app/projects/page.tsx).

**Redesign:** shared application header; “Projects”; a strong New design action; recent models with thumbnails, last opened/edited time, and meaningful status. Start with a clean list that includes a preview column; optionally offer a grid when users have visually distinct projects. Search/filter becomes important as the collection grows. Avoid adding dashboard charts or empty activity widgets.

The empty state should offer “Describe a part,” “Import geometry,” and “Open an example” only when supported, with a small preview illustrating the resulting workspace. For signed-out visitors, move to sign-in with return context or show a coherent public shell explaining the required next step.

### New project `/projects/new`

**Source observations:** the route renders `NewProject` with no server authentication check. Creation then calls an API requiring a user. The only input is a required project title; the real design request happens later. The component is not a form, so it lacks normal submit semantics. It has no back/cancel action, and network exceptions do not clear the loading state.

**Source:** [Route](/home/manan/CadPilot/app/projects/new/page.tsx), [creation component](/home/manan/CadPilot/components/projects/new-project.tsx), [project API](/home/manan/CadPilot/app/api/projects/route.ts).

**Redesign:** authenticate before presenting a private creation task, retaining the destination. Let users start with a part description, an import, or a supported example. Generate a provisional title and let them rename it. If a title-first flow is retained, use a proper form, a visible return path, recoverable errors, and a clear explanation of what happens next.

Acceptance: a signed-out user following the landing CTA reaches the intended design workspace after authentication without re-entering a preserved brief; an authenticated user can create via Enter; errors never trap the button in a pending state.

### Project workspace `/projects/[slug]`

**Source observations:** the current component starts with an equal-width conversation/model split. Review and files compete with the model in the inspector. Share and add-view buttons have no handlers. Attachment selection stores a filename only; the model selector remains local state. The active run icon becomes a disabled square rather than a working stop action. Some failed requests return silently. All review-step icons use a success-like checkmark regardless of status.

**Source:** [Workspace](/home/manan/CadPilot/components/projects/project-workspace.tsx), [composer](/home/manan/CadPilot/components/projects/agent-composer.tsx), [file preview](/home/manan/CadPilot/components/projects/workspace-file-preview.tsx).

**Responsive risk from source:** the workspace sets `gridTemplateColumns` inline, while the mobile stylesheet tries to replace it with a single column. The inline declaration takes precedence. With the resize handle hidden, the second panel can occupy the narrow separator column. Confirm on an authenticated mobile workspace before claiming the exact rendered failure. The existing responsive script checks CSS text, so it cannot establish that the computed layout is correct.

**Redesign:** make Model the main working surface, with a collapsible assistant and contextual properties. Provide visible revision/save state, a genuine stop control, concise change cards, and expandable activity. Use complete button behavior and truthful states before adding new controls. On phones switch between Model and Assistant/Review rather than stacking a full transcript ahead of the model or retaining a desktop grid.

File previews need format-aware handling: images for SVG, a proper PDF preview/download state, readable source/report rendering, and metadata/download for binary files. The current component fetches every non-SVG artifact as text, including binary formats, and truncates without an explicit truncation notice. That can produce unreadable “previews.” Add loading/error feedback and protect against stale responses when changing files quickly.

This page needs interaction redesign as much as visual redesign. The [platform report](/home/manan/CadPilot/docs/PLATFORM_TARGET_STATE.md) specifies the underlying revision and save contracts.

### Standalone editor `/chili-editor`

The current neutral canvas, compact menus, and restrained controls are a good direction for the application. Retain the functional desktop-tool quality. Improve the empty state, discoverability, and naming rather than dressing the canvas in marketing components.

Show an unobtrusive “Create a sketch / Add a solid / Import geometry” prompt when the document is empty, plus navigation guidance. Explain when the editor is outside a project and what can be saved where. Filter diagnostic commands such as Performance Test out of the normal task path; clarify labels such as Toggle. Make Items/Properties discoverable at small sizes. Group snapping options behind a clearly labeled control when space is constrained.

**Evidence:** live editor inspection and captures from the preceding platform review; [command surface](/home/manan/CadPilot/components/cad/viewport-tools.tsx) and [workbench](/home/manan/CadPilot/components/cad/cad-workbench.tsx). The current browser audit should confirm which findings remain visible.

### Public project `/p/[slug]`

This is the largest website-specific gap. The route loads artifacts but renders only the title, summary, author, revision number, and validity label. There is no model preview, dimensions, change context, download control, or useful product navigation.

**Source:** [Public project](/home/manan/CadPilot/app/p/[slug]/page.tsx).

**Redesign:** a model-led share page with the published revision, model viewer, named parts if available, dimension/units information, author, purpose, and evidence-based check status. Show downloads only when the publisher permits them. Offer an explicit “View only” explanation and a way to open the product. Public access to geometry/artifacts requires an authorization design: the current artifact endpoint is owner-only, so adding a viewer alone is insufficient. Keep public access tied to the published revision, not all project history.

Acceptance: a recipient without an account can inspect the intended published model, understand which revision it is, and perform only the actions the publisher allowed.

### Creator profile `/u/[username]`

**Source observations:** heading, bio/fallback text, and links to public projects. No avatar despite the profile field, no model imagery, and no empty state. Project fallback text implies validated parametric output even when the profile page does not establish that capability.

**Source:** [Profile](/home/manan/CadPilot/app/u/[username]/page.tsx).

**Redesign:** a small identity header and a visually browsable published-model list. Use real model thumbnails, concise descriptions, and clear revision links. State “No published projects yet” when empty. Avoid making the profile a full social network before shared-project pages are useful.

## Cross-page interaction and accessibility corrections

- **Link/button semantics:** several pages wrap a real Button in Link. Use the existing Button `asChild` capability to render one interactive anchor. This is a source-level nested-interactive issue; inspect the resulting DOM after correcting it.
- **Keyboard behavior:** keep visible focus and logical navigation; provide non-drag alternatives for resizing; supply an actual form for project creation. Test the iframe focus boundary independently.
- **Errors and recovery:** implement explicit loading, empty, disconnected, failed, unauthorized, and retry states for each asynchronous task. Existing alert roles are useful, but field-level association and network recovery remain incomplete.
- **Motion:** CSS reduced-motion overrides do not stop the JavaScript renderer loop or its autorotation. Connect the viewer to `prefers-reduced-motion` and provide a stable initial model view or pause control.
- **Performance:** `CadModelVisual` activates on first intersection and never deactivates; each viewer starts a continuous render loop. After scrolling, the four examples can remain active. Stop rendering offscreen or use one interactive demo plus static illustrative captures. This is a code-path observation, not a measured FPS/Lighthouse score.
- **Small text:** uppercase 10 px labels and extreme negative heading tracking recur. Reserve small labels for truly secondary information. Keep instructions, inputs, and important status legible at normal zoom and with text enlargement.
- **Responsive navigation:** landing section links are hidden below the mobile breakpoint without a replacement menu. They are in-page anchors, so users can still scroll to content, but deliberate section navigation is lost. Use a compact accessible menu if those destinations remain useful.
- **Metadata and recovery pages:** add meaningful public project/profile titles and previews. Provide product-consistent missing/error pages. Verify deployment canonical URLs and indexing behavior separately; this audit does not establish production crawlability.

[W3C's form guidance](https://www.w3.org/WAI/tutorials/forms/) supports explicit labels, instructions, and usable feedback. [Nielsen Norman Group's minimalist-design guidance](https://www.nngroup.com/articles/aesthetic-minimalist-design/) supports prioritizing useful information; minimalism does not mean leaving the user without context or a next action. These references inform the review, not a claim that the site passed a formal standard.

## Proposed visual system

Use the current restrained workbench as the functional baseline, then give the website a deliberate editorial layer:

| Element | Proposed rule |
|---|---|
| Brand | One name, logo, icon family, and account/home destination |
| Colors | Neutral surfaces and ink; one action accent; separate selection/warning/error/success roles |
| Typography | Existing system sans; 48–64 px marketing hero, 28–32 px utility page title, 16 px reading/forms, 13–14 px compact desktop UI |
| Spacing | 4 px base; 16/24/32 px utility rhythm; larger section spacing only where it supports distinct content |
| Corners | Modest, consistent controls/cards; large containers only where meaningful |
| Actions | One clear primary action per task; use text/outline actions for secondary options |
| Model imagery | Real task-specific parts; repeat imagery only to demonstrate an actual change |
| Motion | Feedback and continuity; no persistent decorative movement competing with reading/model inspection |
| Components | Compose existing Magic UI/shadcn primitives; keep page layout outside generated internals |

These sizes are starting specifications for prototypes, not universal constraints. Validate contrast on actual rendered foreground/background combinations and test compact controls separately from touch layouts.

## Redesign order

1. **Repair the entry journey and misleading controls.** Sign-in return paths, private project creation, working actions, explicit failures, mobile grid behavior, and correct public-project expectations.
2. **Establish shared foundations.** Brand, tokens, heading scale, button/link treatment, application/public shells, form and empty-state patterns. Consolidate CSS ownership as each surface is migrated.
3. **Redesign the core product pages together.** Projects → New design → Workspace. These should feel like one flow and preserve context.
4. **Complete public sharing.** Viewer, revision identity, scoped artifacts, and author navigation; then improve profiles.
5. **Rebuild the landing story around the functioning product.** One strong demonstration and distinct evidence. Refresh auth presentation alongside the common identity.

Do not perform a blanket stylesheet replacement across the dirty working tree. Work in bounded page/feature changes, preserve behavior, and validate each against the same token and interaction rules.

## Acceptance checklist for implementation

- Trace the signed-out CTA → authentication → intended workspace path with return context preserved.
- Test desktop, tablet, and narrow phone layouts at 1440, 1024, 768, and 390 CSS px, plus text enlargement. Record computed panel widths and horizontal overflow.
- Verify every visible control has a supported action or an explained unavailable state.
- Complete keyboard-only sign-in, project creation, project navigation, tool search, and file selection; check focus across the editor boundary.
- Test network failure and slow responses without losing typed input or leaving a permanent pending button.
- Verify reduced motion affects the model renderer, not only CSS transitions.
- Confirm public recipients see only the published revision and permitted files.
- Compare key pages with long titles, no projects, many projects, missing previews, failed runs, and unavailable files.
- Use real browser/layout tests. The current CSS-regex responsive check is not evidence of usable mobile rendering.
- Run the repository's required type/build checks when components change; no application changes are included in this audit.

Validate the proposed designs with several target users on concrete tasks: understand what the product produces, start a part, find an existing model, make a change, recover from failure, and open a shared design. Record task success and confusion before asking whether they like the appearance. Avoid arbitrary “design scores” without a defined measurement method.
