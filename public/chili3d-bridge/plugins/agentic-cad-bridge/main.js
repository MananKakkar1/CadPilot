// CadPilot bridge plugin for Chili3D.
//
// Loaded at runtime via `?plugin=` (see app/chili-editor/page.tsx), so it ships as a plain
// ES module with no build step: it reads `@chili3d/core` off the `Chili3dCore` global the
// host app assigns at startup (see chili3d's packages/builder/src/appBuilder.ts), the same
// convention chili3d's own externally-built plugins use.
//
// Talks to the parent window (the /chili-editor page, always same-origin) over postMessage:
//   host -> plugin: { source: "agentic-cad", type: "import-step", step, name }
//   plugin -> host: { source: "chili3d-bridge", type: "ready" | "importing" | "import-done" | "export-step", step?, name? }

const { command, CommandStore, Config, Mesh, MeshNode, PubSub, VisualNode } = Chili3dCore;

// Chili3D's own navigation profiles (packages/core/src/navigation.ts's Navigation3DTypes,
// confirmed against the pinned upstream source): one profile name drives mouse
// orbit/pan/zoom bindings, wheel-zoom direction, AND keyboard shortcuts (ShortcutProfiles)
// together — there is no separate "shortcut preset" to wire up, this one setting is both.
const NAV_PRESETS = ["Chili3d", "Revit", "Blender", "Creo", "Solidworks"];

function isEmbedded() {
    return window.parent && window.parent !== window;
}

function postToHost(message) {
    if (!isEmbedded()) return false;
    window.parent.postMessage({ source: "chili3d-bridge", ...message }, window.location.origin);
    return true;
}

function postCommands() {
    postToHost({ type: "commands", commands: CommandStore.getAllCommands().map(({ key, helpText, isApplicationCommand }) => ({ key, label: Chili3dCore.I18n.translate("command." + key), helpText, isApplicationCommand })) });
}

function applyRendererOnlySurface() {
    if (!isEmbedded() || document.getElementById("agentic-cad-renderer-only")) return;
    const style = document.createElement("style");
    document.documentElement.classList.add("cad-engine");
    const theme = document.createElement("link");
    theme.rel = "stylesheet";
    theme.href = "/cad-workbench.css";
    document.head.appendChild(theme);
    style.id = "agentic-cad-renderer-only";
    style.textContent = `
      body { overflow: hidden !important; margin: 0 !important; background: var(--cad-canvas) !important; }
      chili3d-main-window { display: block !important; position: fixed !important; inset: 0 !important; }
      /* chili-ribbon stays hidden: CadPilot's own ViewportTools (grouped by workflow tab,
         same as this ribbon would be) is the ribbon-equivalent shown to users, per
         docs/cad-workbench.md. chili-ai-chat is upstream's own AI panel — CadPilot has its
         own agent surface. chili-project-view/chili-property-view/chili-toolbar (the tree +
         inspector sidebar) are NOT hidden here any more: they're persistent chrome by
         default, see the sidebar rule below, so a CAD user coming from another tool sees
         them immediately instead of behind a flyout toggle. */
      chili-home, chili-ribbon, chili-ai-chat { display: none !important; }
      chili-statusbar { display: flex !important; flex-direction: column !important; align-items: stretch !important; flex: 0 0 auto !important; height: auto !important; min-height: 28px; max-width: 100%; gap: 4px; padding: 4px 8px; box-sizing: border-box; }
      chili-statusbar > div { display: block !important; flex: none !important; min-width: 0; max-width: 100%; line-height: 1.4; }
      chili-statusbar > div:last-child { overflow-x: auto; }
      chili-snap-config { display: flex !important; width: max-content; white-space: nowrap; }
      /* Chili3D keeps fixed-width wrapper columns around hidden shell elements.
         Collapse those wrappers so the viewport owns the entire renderer surface. */
      chili-editor > div > div { width: 100% !important; min-width: 0 !important; flex-direction: row !important; }
      /* nth-child(3) is upstream's own AI chat dock (appended only when its panel is open) —
         always hidden, CadPilot has its own agent surface. nth-child(1) is the native
         tree+property sidebar (see below); nth-child(2) is the viewport. */
      chili-editor > div > div > div:nth-child(3) { display: none !important; }
      chili-editor > div > div > div:nth-child(2) { flex: 1 1 auto !important; width: 100% !important; min-width: 0 !important; isolation: isolate; order: 1; }
      chili-editor, chili-viewport { display: block !important; position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
      chili-uiview { display: block !important; position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
      chili-uiview > canvas { display: block !important; width: 100% !important; height: 100% !important; }
      /* Native object/property sidebar (tree + inspector): persistent chrome by default, not a
         flyout, so it reads like Fusion/SolidWorks/Onshape's always-present panels. The
         "Objects and properties" toolbar toggle still exists (viewport-tools.tsx) purely to
         reclaim canvas space on demand; it starts open (see cad-workbench.tsx's default state)
         instead of starting closed. */
      chili-editor > div > div > div:nth-child(1) { display: flex !important; order: 2; width: min(320px, 40vw) !important; flex: 0 0 min(320px, 40vw) !important; min-width: 0 !important; overflow: auto !important; border-left: 1px solid var(--cad-border); }
      chili-project-view, chili-property-view, chili-toolbar { display: flex !important; }
      body:not(.cad-inspectors-open) chili-editor > div > div > div:nth-child(1) { display: none !important; }
      @media (max-width: 600px) {
        chili-editor > div > div > div:nth-child(1) {
          position: absolute !important; inset: 0 0 0 auto !important;
          width: min(320px, 84vw) !important; height: 100% !important;
          z-index: 5; background: var(--cad-surface);
        }
      }
    `;
    document.head.appendChild(style);
}

// Right-click marking menu — a quick radial/list-style menu of contextually relevant
// commands, the convention Fusion/SolidWorks users expect instead of relying solely on a
// top ribbon. Built inside this plugin (not the host) because the canvas the user
// right-clicks on lives inside this same-origin iframe's own document; the host can't reach
// into it to position an overlay without this plugin's help anyway, so it owns the whole
// affordance directly against `CommandStore`/`PubSub`, the same primitives the rest of this
// bridge already uses.
function initMarkingMenu(application) {
    const menu = document.createElement("div");
    menu.className = "cad-marking-menu cad-workbench-surface";
    menu.setAttribute("role", "menu");
    document.body.appendChild(menu);

    const close = () => menu.classList.remove("open");

    // Mirrors the same selection-aware curation ViewportTools uses on the host side
    // (components/cad/viewport-tools.tsx's `contextKeys`) — kept small and duplicated here
    // rather than shared, since this plugin has no module boundary with the host's TS.
    const SELECTED_KEYS = ["modify.move", "modify.fillet", "modify.chamfer", "boolean.cut", "boolean.union"];
    const EMPTY_KEYS = ["create.box", "create.cylinder", "sketch.create", "create.circle"];

    function open(x, y) {
        const selection = application.activeView?.document?.selection;
        const selectedCount = (selection?.getSelectedNodes().length ?? 0) + (selection?.getSelectedShapes().length ?? 0);
        const wanted = selectedCount ? SELECTED_KEYS : EMPTY_KEYS;
        const available = CommandStore.getAllCommands();
        const items = wanted
            .map((key) => available.find((c) => c.key === key))
            .filter(Boolean);
        if (!items.length) return;

        menu.replaceChildren(...items.map((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = Chili3dCore.I18n.translate("command." + item.key);
            button.addEventListener("click", () => {
                PubSub.default.pub("executeCommand", item.key);
                close();
            });
            return button;
        }));

        // Clamp inside the viewport so a click near an edge doesn't overflow off-screen.
        menu.classList.add("open");
        const rect = menu.getBoundingClientRect();
        menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
        menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;
    }

    // Capture phase, not bubble: Chili3D's own viewport element sets `oncontextmenu` with
    // `stopPropagation()` (to suppress the OS menu itself), which would otherwise stop this
    // event from ever bubbling up to `document`. A capture-phase listener runs top-down
    // before that stopPropagation takes effect during the later bubble phase, so it still
    // sees every right-click regardless.
    document.addEventListener("contextmenu", (event) => {
        // Native context menus (e.g. inside a text input) stay native; only the canvas/tree
        // surfaces get the marking menu.
        if (event.target?.closest?.("input, textarea, [contenteditable=true]")) return;
        event.preventDefault();
        open(event.clientX, event.clientY);
    }, true);
    document.addEventListener("pointerdown", (event) => {
        if (!menu.classList.contains("open") || menu.contains(event.target)) return;
        close();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") close();
    });
}

// Feature timeline bridge — Chili3D already has a real parametric feature history per body
// (confirmed against the pinned upstream source, packages/core/src/model/parametricBodyNode.ts):
// `node.featureItems()` (display projection), `node.features` (raw, JSON-backed, editable
// array), `node.setFeaturesEmitShapeChanged(newArray)` (replace + rebuild), and
// `node.rollbackIndex`/`node.setRollbackIndex(index)` (a genuine native "scrub to this point
// in history" primitive — regenerates the shape as of that index and updates the visual).
// This bridge only reads/writes that existing document state; it does not maintain a
// parallel feature model of its own. Duck-typed (`typeof n.featureItems === "function"`)
// rather than an `instanceof` check against `ParametricBodyNode`, since that class isn't
// confirmed to be part of `@chili3d/core`'s public barrel export.
function getFeatureNode(application) {
    const document = application.activeView?.document;
    if (!document) return null;
    const selected = document.selection?.getSelectedNodes().find((node) => typeof node.featureItems === "function");
    if (selected) return selected;
    return document.modelManager.findNodes((node) => typeof node.featureItems === "function" && node.features.length > 0)[0] ?? null;
}

function serializeFeatureList(node) {
    if (!node) return null;
    return {
        nodeId: node.id,
        rollbackIndex: node.rollbackIndex,
        features: node.featureItems().map((item) => ({
            id: item.id,
            name: item.name,
            display: item.display,
            suppressed: item.suppressed,
            error: item.error,
            warning: item.warning,
            parameters: (item.parameters ?? []).map((p) => ({ key: p.key, display: p.display, value: p.value, unit: p.unit })),
        })),
    };
}

class SendToReplicadCommand {
    async execute(application) {
        const document = application.activeView?.document;
        if (!document) {
            PubSub.default.pub("showToast", "agenticCad.noDocument");
            return;
        }

        // Import creates a folder per STEP product hierarchy, so the exportable geometry is
        // rarely a direct child of rootNode — walk the whole tree instead of just the top level.
        const nodes = document.modelManager.findNodes((n) => n instanceof VisualNode);
        if (nodes.length === 0) {
            PubSub.default.pub("showToast", "agenticCad.noModel");
            return;
        }

        const data = await application.dataExchange.export(".step", nodes);
        if (!data) {
            PubSub.default.pub("showToast", "agenticCad.exportFailed");
            return;
        }

        const step = await new Blob(data).text();
        const sent = postToHost({ type: "export-step", step, name: nodes[0].name || "model" });
        PubSub.default.pub("showToast", sent ? "agenticCad.sent" : "agenticCad.notEmbedded");
    }
}

command({
    key: "agenticCad.sendToReplicad",
    icon: { type: "path", value: "icons/send.svg" },
    helpText: "agenticCad.sendToReplicad.help",
})(SendToReplicadCommand);

class AgenticCadBridgeService {
    register(application) {
        this.application = application;
    }

    async start() {
        applyRendererOnlySurface();
        initMarkingMenu(this.application);
        this.emitState = () => {
            const app = this.application;
            const active = app.executingCommand;
            const selection = app.activeView?.document?.selection;
            postToHost({ type: "workbench-state", state: {
                activeCommand: active ? CommandStore.getComandData(active)?.key ?? null : null,
                canCancel: Boolean(active && typeof active.cancel === "function"),
                selectedCount: (selection?.getSelectedNodes().length ?? 0) + (selection?.getSelectedShapes().length ?? 0),
                navPreset: Config.instance.navigation3D,
            } });
        };
        this.emitFeatureList = () => {
            const node = getFeatureNode(this.application);
            if (node?.id === this.featureNode?.id) { postToHost({ type: "feature-list", list: serializeFeatureList(node) }); return; }
            this.featureNode?.removePropertyChanged(this.onFeatureNodeChanged);
            this.featureNode = node ?? undefined;
            this.featureNode?.onPropertyChanged(this.onFeatureNodeChanged);
            postToHost({ type: "feature-list", list: serializeFeatureList(node) });
        };
        this.onFeatureNodeChanged = (property) => {
            if (property === "featuresJson") postToHost({ type: "feature-list", list: serializeFeatureList(this.featureNode) });
        };
        this.bindSelection = () => {
            this.selection?.onNodeChanged.remove(this.emitState);
            this.selection?.onShapeChanged.remove(this.emitState);
            this.selection?.onNodeChanged.remove(this.emitFeatureList);
            this.selection?.onShapeChanged.remove(this.emitFeatureList);
            this.selection = this.application.activeView?.document?.selection;
            this.selection?.onNodeChanged.sub(this.emitState);
            this.selection?.onShapeChanged.sub(this.emitState);
            this.selection?.onNodeChanged.sub(this.emitFeatureList);
            this.selection?.onShapeChanged.sub(this.emitFeatureList);
            this.emitState();
            this.emitFeatureList();
        };
        this.onApplicationChange = (property) => {
            if (property === "activeView") this.bindSelection();
            if (property === "executingCommand") this.emitState();
        };
        this.application.onPropertyChanged(this.onApplicationChange);
        this.listener = async (event) => {
            if (event.origin !== window.location.origin || event.source !== window.parent) return;
            const data = event.data;
            if (!data || data.source !== "agentic-cad") return;
            if (data.type === "set-theme" && data.tokens && typeof data.tokens === "object") {
                for (const name of ['surface', 'subtle', 'canvas', 'text', 'muted', 'border', 'hover', 'selected', 'focus', 'danger', 'font']) {
                    const key = `--cad-${name}`;
                    if (typeof data.tokens[key] === "string") document.documentElement.style.setProperty(key, data.tokens[key]);
                }
            }
            if (data.type === "import-step") {
                await this.importStep(data.step, data.name);
            }
            if (data.type === "import-preview" && data.preview) {
                this.importPreview(data.preview);
            }
            if (data.type === "execute-command" && typeof data.key === "string") {
                PubSub.default.pub("executeCommand", data.key);
            }
            if (data.type === "cancel-command") {
                await this.application.executingCommand?.cancel?.();
                this.emitState();
            }
            if (data.type === "get-commands") postCommands();
            if (data.type === "set-panels") {
                document.body.classList.toggle("cad-inspectors-open", data.visible === true);
                window.dispatchEvent(new Event("resize"));
            }
            if (data.type === "set-nav-preset" && NAV_PRESETS.includes(data.preset)) {
                Config.instance.navigation3D = data.preset;
                this.emitState();
            }
            if (data.type === "get-feature-list") this.emitFeatureList();
            if (data.type === "set-rollback-index") {
                const node = this.featureNode;
                if (node) { node.setRollbackIndex(data.index ?? undefined); this.emitFeatureList(); }
            }
            if (data.type === "set-feature-suppressed" && typeof data.id === "string") {
                const node = this.featureNode;
                if (node) {
                    const next = node.features.map((feature) => feature.id === data.id ? { ...feature, suppressed: data.suppressed === true } : feature);
                    node.setFeaturesEmitShapeChanged(next);
                    this.emitFeatureList();
                }
            }
            if (data.type === "set-feature-parameter" && typeof data.id === "string" && typeof data.key === "string") {
                const node = this.featureNode;
                if (node) {
                    const next = node.features.map((feature) => feature.id !== data.id ? feature : {
                        ...feature,
                        parameters: (feature.parameters ?? []).map((param) => param.key === data.key ? { ...param, value: data.value } : param),
                    });
                    node.setFeaturesEmitShapeChanged(next);
                    this.emitFeatureList();
                }
            }
        };
        window.addEventListener("message", this.listener);
        // Chili3D does not create a viewport scene until a document exists. The
        // embedded renderer must have a live camera/plane surface even before a
        // generated STEP or preview arrives.
        if (!this.application.activeView?.document) {
            await this.application.newDocument("Untitled");
        }
        postToHost({ type: "ready" });
        postCommands();
        this.bindSelection();
    }

    stop() {
        if (this.listener) window.removeEventListener("message", this.listener);
        this.application.removePropertyChanged(this.onApplicationChange);
        this.selection?.onNodeChanged.remove(this.emitState);
        this.selection?.onShapeChanged.remove(this.emitState);
        this.selection?.onNodeChanged.remove(this.emitFeatureList);
        this.selection?.onShapeChanged.remove(this.emitFeatureList);
        this.featureNode?.removePropertyChanged(this.onFeatureNodeChanged);
    }

    async importStep(step, name) {
        postToHost({ type: "importing" });
        // OCCT's STEP import runs synchronously on this thread and can take a while for
        // complex geometry (e.g. threaded fasteners) — yield one frame first so the host's
        // "importing" UI actually paints before the page stops responding.
        await new Promise((resolve) => requestAnimationFrame(resolve));

        const app = this.application;
        const document = app.activeView?.document ?? (await app.newDocument(name || "Untitled"));
        const file = new File([step], `${name || "model"}.step`, { type: "application/step" });
        await app.dataExchange.import(document, [file]);
        const previews = document.modelManager.findNodes((node) => node instanceof MeshNode && node.name === "CadPilot preview");
        if (previews.length) document.rootNode.remove(...previews);
        app.activeView?.cameraController.fitContent();
        PubSub.default.pub("showToast", "agenticCad.received");
        postToHost({ type: "import-done" });
    }

    importPreview(preview) {
        const document = this.application.activeView?.document;
        if (!document || !preview?.parts?.length) return;
        const position = [];
        const index = [];
        let vertexOffset = 0;
        for (const part of preview.parts) {
            if (!Array.isArray(part.vertices) || !Array.isArray(part.triangles)) continue;
            position.push(...part.vertices);
            index.push(...part.triangles.map((value) => value + vertexOffset));
            vertexOffset += part.vertices.length / 3;
        }
        if (!position.length || !index.length) return;
        const node = new MeshNode({ document, name: "CadPilot preview", mesh: new Mesh({ meshType: "surface", position: new Float32Array(position), index: new Uint32Array(index), color: 0x64748b }) });
        document.rootNode.add(node);
        this.application.activeView?.cameraController.fitContent();
        postToHost({ type: "preview-ready" });
    }
}

const AgenticCadBridgePlugin = {
    commands: [SendToReplicadCommand],
    ribbons: [
        {
            tabName: "ribbon.tab.agenticCad",
            groups: [
                {
                    groupName: "ribbon.group.agenticCadBridge",
                    items: ["agenticCad.sendToReplicad"],
                },
            ],
        },
    ],
    services: [new AgenticCadBridgeService()],
    guide: [
        {
            name: "CadPilot Bridge",
            content:
                "The CadPilot tab has a 'Save to Project' button that exports the current model as STEP and saves it as a new revision on the CadPilot project this editor was opened from.",
        },
    ],
    i18nResources: [
        {
            language: "en",
            display: "English",
            translation: {
                "ribbon.tab.agenticCad": "CadPilot",
                "ribbon.group.agenticCadBridge": "Bridge",
                "command.agenticCad.sendToReplicad": "Save to Project",
                "agenticCad.sendToReplicad.help": "Save this model as a new revision on the CadPilot project",
                "agenticCad.sent": "Model sent to CadPilot — saving as a new revision",
                "agenticCad.notEmbedded": "Open this editor from a CadPilot project to save models back",
                "agenticCad.received": "Model imported from CadPilot",
                "agenticCad.noDocument": "Nothing to save yet",
                "agenticCad.noModel": "Add a model before saving it",
                "agenticCad.exportFailed": "Could not export this model to STEP",
            },
        },
        {
            language: "zh-CN",
            display: "简体中文",
            translation: {
                "ribbon.tab.agenticCad": "CadPilot",
                "ribbon.group.agenticCadBridge": "桥接",
                "command.agenticCad.sendToReplicad": "保存到项目",
                "agenticCad.sendToReplicad.help": "将当前模型另存为 CadPilot 项目的新修订版本",
                "agenticCad.sent": "模型已发送到 CadPilot，正在保存为新修订版本",
                "agenticCad.notEmbedded": "请从 CadPilot 项目打开此编辑器以保存模型",
                "agenticCad.received": "已从 CadPilot 导入模型",
                "agenticCad.noDocument": "暂无可保存的内容",
                "agenticCad.noModel": "请先添加模型",
                "agenticCad.exportFailed": "导出 STEP 失败",
            },
        },
    ],
};

export default AgenticCadBridgePlugin;
