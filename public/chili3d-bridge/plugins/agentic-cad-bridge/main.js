// Agentic CAD bridge plugin for Chili3D.
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
    postToHost({ type: "commands", commands: CommandStore.getAllCommands().map(({ key, helpText, isApplicationCommand }) => ({ key, helpText, isApplicationCommand })) });
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

    start() {
        this.listener = async (event) => {
            if (event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || data.source !== "agentic-cad") return;
            if (data.type === "import-step") {
                await this.importStep(data.step, data.name);
            }
            if (data.type === "import-preview" && data.preview) {
                this.importPreview(data.preview);
            }
            if (data.type === "execute-command" && typeof data.key === "string") {
                PubSub.default.pub("executeCommand", data.key);
            }
            if (data.type === "get-commands") postCommands();
        };
        window.addEventListener("message", this.listener);
        postToHost({ type: "ready" });
        postCommands();
    }

    stop() {
        if (this.listener) window.removeEventListener("message", this.listener);
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
        const previews = document.modelManager.findNodes((node) => node instanceof MeshNode && node.name === "Agentic CAD preview");
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
        const node = new MeshNode({ document, name: "Agentic CAD preview", mesh: new Mesh({ meshType: "surface", position: new Float32Array(position), index: new Uint32Array(index), color: 0x64748b }) });
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
            name: "Agentic CAD Bridge",
            content:
                "The Agentic CAD tab has a 'Save to Project' button that exports the current model as STEP and saves it as a new revision on the Agentic CAD project this editor was opened from.",
        },
    ],
    i18nResources: [
        {
            language: "en",
            display: "English",
            translation: {
                "ribbon.tab.agenticCad": "Agentic CAD",
                "ribbon.group.agenticCadBridge": "Bridge",
                "command.agenticCad.sendToReplicad": "Save to Project",
                "agenticCad.sendToReplicad.help": "Save this model as a new revision on the Agentic CAD project",
                "agenticCad.sent": "Model sent to Agentic CAD — saving as a new revision",
                "agenticCad.notEmbedded": "Open this editor from an Agentic CAD project to save models back",
                "agenticCad.received": "Model imported from Agentic CAD",
                "agenticCad.noDocument": "Nothing to save yet",
                "agenticCad.noModel": "Add a model before saving it",
                "agenticCad.exportFailed": "Could not export this model to STEP",
            },
        },
        {
            language: "zh-CN",
            display: "简体中文",
            translation: {
                "ribbon.tab.agenticCad": "Agentic CAD",
                "ribbon.group.agenticCadBridge": "桥接",
                "command.agenticCad.sendToReplicad": "保存到项目",
                "agenticCad.sendToReplicad.help": "将当前模型另存为 Agentic CAD 项目的新修订版本",
                "agenticCad.sent": "模型已发送到 Agentic CAD，正在保存为新修订版本",
                "agenticCad.notEmbedded": "请从 Agentic CAD 项目打开此编辑器以保存模型",
                "agenticCad.received": "已从 Agentic CAD 导入模型",
                "agenticCad.noDocument": "暂无可保存的内容",
                "agenticCad.noModel": "请先添加模型",
                "agenticCad.exportFailed": "导出 STEP 失败",
            },
        },
    ],
};

export default AgenticCadBridgePlugin;
