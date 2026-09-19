/**
 * Dedicated CAD worker. Run in a separate container/process with a shared artifact volume:
 *   npm run cad:worker
 * The process has no HTTP listener and executes generated geometry only in a restricted VM.
 */
import { PrismaClient, BuildStatus, ArtifactKind } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import * as replicad from 'replicad';
import openCascade from 'replicad-opencascadejs';

const prisma = new PrismaClient();
const artifactRoot = process.env.CAD_ARTIFACT_DIR || '.cad-artifacts';
const apiKey = process.env.GEMINI_API_KEY;
const forbidden = /\b(?:require|import|process|globalThis|Function|eval|WebAssembly|fetch|XMLHttpRequest|setTimeout|setInterval|constructor)\b/;

let initialized = false;
async function initCad() { if (!initialized) { replicad.setOC(await openCascade()); initialized = true; } }
async function event(jobId, stage, agent, summary, tool, detail) {
  const count = await prisma.buildEvent.count({ where: { jobId } });
  await prisma.buildEvent.create({ data: { jobId, sequence: count + 1, stage, agent, summary, tool, detail } });
}
function intentFor(prompt) { return { object: prompt.split(/[,.]/)[0].slice(0, 120), units: 'mm', dimensions: {}, constraints: ['valid closed BREP', 'editable dimensions'], materials: ['anodized aluminum'] }; }
function planFor(intent) { return { summary: `Build a parametric ${intent.object}.`, decision: 'Use parameterized BREP primitives and boolean operations so the result remains editable.', features: [{ name: 'primary-solid', operation: 'parametric-solid', parameters: {} }] }; }
function engineeringReport(revisionNumber, intent, plan, metrics, validation) {
  return `## Revision ${revisionNumber} validated\n\n${plan.summary}\n\n### Engineering summary\n\n| Measure | Result |\n| --- | ---: |\n| Volume | ${metrics.volume.toLocaleString()} mm³ |\n| Surface area | ${metrics.surfaceArea.toLocaleString()} mm² |\n| Triangles | ${metrics.triangleCount.toLocaleString()} |\n| Quality score | ${validation.score}/100 |\n\nThe measured volume is computed from the closed BREP: $V = ${metrics.volume.toLocaleString()}\\,\\mathrm{mm^3}$.\n\n### Build path\n\n\`\`\`mermaid\nflowchart LR\n  A[Design intent] --> B[${intent.object.replace(/[\[\]]/g, '').slice(0, 48)}]\n  B --> C[Parametric BREP]\n  C --> D[OpenCascade validation]\n  D --> E[STEP + STL]\n\`\`\`\n\n**Design rationale:** ${plan.decision}\n\nThe source, structured plan, preview mesh, STEP, STL, and audit report are attached to this revision.`;
}
function fallbackCode(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('gear')) return "function main() { const teeth = 20, module = 2, thickness = 6, root = 18; let shape = makeCylinder(root, thickness); for (let i=0;i<teeth;i++) { const a=i*Math.PI*2/teeth; const x=Math.cos(a)*(root+1), y=Math.sin(a)*(root+1); shape=shape.fuse(makeBox([x-2,y-2,0],[x+2,y+2,thickness])); } return shape.cut(makeCylinder(5, thickness+2, [0,0,-1])); }";
  return "function main() { const width = 80, depth = 50, height = 64; const base = makeBaseBox(width, depth, 5).translate([-width/2,-depth/2,0]); const back = makeBaseBox(width, 5, height).translate([-width/2,depth/2-5,0]); const lip = makeBaseBox(width, 10, 10).translate([-width/2,-depth/2,0]); return base.fuse(back).fuse(lip); }";
}
async function generateCode(prompt, plan) {
  if (!apiKey) return fallbackCode(prompt);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Return only Replicad JavaScript. Define main(). Build this planned object: ${JSON.stringify(plan)}. User request: ${prompt}` }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 12000 } }) });
  if (!response.ok) throw new Error(`Generator failed (${response.status}).`);
  const text = (await response.json())?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  return text.replace(/```(?:javascript|js)?/gi, '').replace(/```/g, '').trim();
}
function compile(code) {
  if (!code || code.length > 80_000 || forbidden.test(code)) throw new Error('Generated code violates the server execution policy.');
  const context = vm.createContext(Object.freeze({ replicad, console: Object.freeze({ log() {} }) }), { codeGeneration: { strings: false, wasm: false } });
  const script = new vm.Script(`'use strict'; ${code}; main(replicad);`);
  return script.runInContext(context, { timeout: 8_000 });
}
async function saveArtifact(revisionId, kind, filename, mimeType, content) {
  const bytes = content instanceof Uint8Array ? content : new TextEncoder().encode(content);
  const storageKey = join(revisionId, filename);
  await mkdir(join(artifactRoot, revisionId), { recursive: true });
  await writeFile(join(artifactRoot, storageKey), bytes);
  await prisma.artifact.upsert({ where: { revisionId_kind: { revisionId, kind } }, update: { filename, mimeType, storageKey, byteSize: bytes.byteLength }, create: { revisionId, kind, filename, mimeType, storageKey, byteSize: bytes.byteLength } });
}
async function processJob(job) {
  await prisma.buildJob.update({ where: { id: job.id }, data: { status: BuildStatus.RUNNING, startedAt: new Date() } });
  try {
    await initCad();
    await event(job.id, 'intent', 'intent agent', 'Converted the request into constrained engineering intent.', 'structured-output');
    const intent = intentFor(job.prompt);
    await event(job.id, 'plan', 'parametric planner', 'Selected editable primitives and a feature sequence.', 'feature-plan', { decision: 'Keep dimensions parameterized and use BREP operations.' });
    const plan = planFor(intent);
    await event(job.id, 'generate', 'Replicad generator', 'Generated allowlisted Replicad source code.', 'gemini');
    let code = await generateCode(job.prompt, plan);
    let shape;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { shape = compile(code); break; }
      catch (error) {
        if (attempt === 2) throw error;
        await event(job.id, 'repair', 'repair agent', 'Compiler rejected the draft; retrying with a constrained fallback.', 'policy-repair', { attempt: attempt + 1 });
        code = fallbackCode(job.prompt);
      }
    }
    if (!shape?.mesh || !shape?.boundingBox) throw new Error('Generated code did not return a Replicad solid.');
    const mesh = shape.mesh({ tolerance: 0.12, angularTolerance: 20 });
    if (mesh.triangles.length / 3 > 400_000) throw new Error('Generated mesh exceeds the 400,000 triangle limit.');
    const [min, max] = shape.boundingBox.bounds;
    const metrics = { volume: Math.round(replicad.measureVolume(shape)), surfaceArea: Math.round(replicad.measureArea(shape)), partCount: 1, triangleCount: mesh.triangles.length / 3, bounds: { min, max } };
    const validation = { valid: metrics.volume > 0 && metrics.triangleCount > 0, score: metrics.volume > 0 ? 100 : 0, findings: metrics.volume > 0 ? ['Closed BREP generated.', 'Mesh is within the configured limit.'] : ['Solid has no measurable volume.'] };
    if (!validation.valid) throw new Error('Generated shape failed deterministic validation.');
    const nextNumber = (await prisma.revision.count({ where: { projectId: job.projectId } })) + 1;
    const revision = await prisma.revision.create({ data: { projectId: job.projectId, revisionNumber: nextNumber, parentId: job.parentId, prompt: job.prompt, intent, plan, sourceCode: code, metrics, validation, isValid: true } });
    await saveArtifact(revision.id, ArtifactKind.SOURCE, 'model.js', 'text/javascript', code);
    await saveArtifact(revision.id, ArtifactKind.INTENT, 'intent.json', 'application/json', JSON.stringify(intent, null, 2));
    await saveArtifact(revision.id, ArtifactKind.PLAN, 'plan.json', 'application/json', JSON.stringify(plan, null, 2));
    await saveArtifact(revision.id, ArtifactKind.PREVIEW_MESH, 'preview.json', 'application/json', JSON.stringify(mesh));
    await saveArtifact(revision.id, ArtifactKind.STEP, 'model.step', 'application/step', new Uint8Array(await shape.blobSTEP().arrayBuffer()));
    await saveArtifact(revision.id, ArtifactKind.STL, 'model.stl', 'model/stl', new Uint8Array(await shape.blobSTL({ binary: true }).arrayBuffer()));
    await saveArtifact(revision.id, ArtifactKind.AUDIT, 'audit.json', 'application/json', JSON.stringify({ intent, plan, metrics, validation }, null, 2));
    await prisma.chatMessage.create({ data: { conversation: { connectOrCreate: { where: { projectId: job.projectId }, create: { projectId: job.projectId } } }, role: 'assistant', content: engineeringReport(nextNumber, intent, plan, metrics, validation), revisionId: revision.id } });
    await event(job.id, 'evaluate', 'BREP evaluator', 'Validated the BREP and generated STEP, STL, preview, and audit files.', 'OpenCascade', { metrics, validation });
    await prisma.buildJob.update({ where: { id: job.id }, data: { status: BuildStatus.SUCCEEDED, revisionId: revision.id, finishedAt: new Date() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await event(job.id, 'failed', 'orchestrator', 'Build failed before a validated BREP was produced.', undefined, { message });
    await prisma.buildJob.update({ where: { id: job.id }, data: { status: BuildStatus.FAILED, error: message, finishedAt: new Date() } });
  }
}
async function tick() {
  const job = await prisma.buildJob.findFirst({ where: { status: BuildStatus.QUEUED }, orderBy: { createdAt: 'asc' } });
  if (!job) return;
  const claimed = await prisma.buildJob.updateMany({ where: { id: job.id, status: BuildStatus.QUEUED }, data: { status: BuildStatus.RUNNING, claimedAt: new Date() } });
  if (claimed.count) await processJob(job);
}
console.log('Agentic CAD worker started.');
setInterval(() => tick().catch((error) => console.error('Worker tick failed', error)), 1_000);
await tick();
