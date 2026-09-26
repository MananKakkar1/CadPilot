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

const { command, CommandStore, Mesh, MeshNode, PubSub, VisualNode } = Chili3dCore;

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
      chili-home, chili-ribbon, chili-project-view, chili-property-view, chili-ai-chat,
      chili-toolbar { display: none !important; }
      chili-statusbar { display: flex !important; flex-direction: column !important; align-items: stretch !important; flex: 0 0 auto !important; height: auto !important; min-height: 28px; max-width: 100%; gap: 4px; padding: 4px 8px; box-sizing: border-box; }
      chili-statusbar > div { display: block !important; flex: none !important; min-width: 0; max-width: 100%; line-height: 1.4; }
      chili-statusbar > div:last-child { overflow-x: auto; }
      chili-snap-config { display: flex !important; width: max-content; white-space: nowrap; }
      /* Chili3D keeps fixed-width wrapper columns around hidden shell elements.
         Collapse those wrappers so the viewport owns the entire renderer surface. */
      chili-editor > div > div { width: 100% !important; min-width: 0 !important; flex-direction: row !important; }
      chili-editor > div > div > div:nth-child(1),
      chili-editor > div > div > div:nth-child(3) { display: none !important; }
      chili-editor > div > div > div:nth-child(2) { flex: 1 1 auto !important; width: 100% !important; min-width: 0 !important; isolation: isolate; }
      chili-editor, chili-viewport { display: block !important; position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
      chili-uiview { display: block !important; position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
      chili-uiview > canvas { display: block !important; width: 100% !important; height: 100% !important; }
      /* Preserve native CAD-specific object/property controls, not the AI sidebar. */
      body.cad-inspectors-open chili-editor > div > div > div:nth-child(1) { display: flex !important; order: 2; width: min(256px, 42vw) !important; flex: 0 0 min(256px, 42vw) !important; min-width: 0 !important; overflow: auto !important; border-left: 1px solid var(--cad-border); }
      body.cad-inspectors-open chili-project-view,
      body.cad-inspectors-open chili-property-view,
      body.cad-inspectors-open chili-toolbar { display: flex !important; }
      @media (max-width: 600px) {
        body.cad-inspectors-open chili-editor > div > div > div:nth-child(1) {
          position: absolute !important; inset: 0 0 0 auto !important;
          width: min(256px, 80vw) !important; height: 100% !important;
          z-index: 5; background: var(--cad-surface);
        }
      }
    `;
    document.head.appendChild(style);
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
        this.emitState = () => {
            const app = this.application;
            const active = app.executingCommand;
            const selection = app.activeView?.document?.selection;
            postToHost({ type: "workbench-state", state: {
                activeCommand: active ? CommandStore.getComandData(active)?.key ?? null : null,
                canCancel: Boolean(active && typeof active.cancel === "function"),
                selectedCount: (selection?.getSelectedNodes().length ?? 0) + (selection?.getSelectedShapes().length ?? 0),
            } });
        };
        this.bindSelection = () => {
            this.selection?.onNodeChanged.remove(this.emitState);
            this.selection?.onShapeChanged.remove(this.emitState);
            this.selection = this.application.activeView?.document?.selection;
            this.selection?.onNodeChanged.sub(this.emitState);
            this.selection?.onShapeChanged.sub(this.emitState);
            this.emitState();
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
