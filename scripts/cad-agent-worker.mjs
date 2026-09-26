/**
 * Dedicated CAD worker. Run in a separate container/process with a shared artifact volume:
 *   npm run cad:worker
 * The process has no HTTP listener and executes generated geometry only in a restricted VM.
 *
 * Generation (system prompt, Wikipedia grounding, model fallback chain, fidelity pass) lives in lib/cad/gemini-generate.mjs;
 * sandboxed execution, multi-part / raw-mesh support and exports live in lib/cad/build-runtime.mjs.
 */
import { PrismaClient, BuildStatus, ArtifactKind, AgentRunStatus, AgentStepStatus } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import * as replicad from 'replicad';
import openCascade from 'replicad-opencascadejs';
import { generateCadCode } from '../lib/cad/gemini-generate.mjs';
import { buildParametricPlan, inferDesignIntent } from '../lib/cad/intent.mjs';
import { assertJobRunning, withRunningJob, JobStoppedError } from '../lib/cad/job-lifecycle.mjs';
import { buildFromCode, describeError } from '../lib/cad/build-runtime.mjs';
import { buildBlueprint } from '../lib/cad/blueprint.mjs';
import { buildSketch } from '../lib/cad/sketch.mjs';

// Next loads .env.local for the web process, but this standalone worker does not.
// Load only missing variables so explicit process environment still wins.
try {
  const envFile = readFileSync('.env.local', 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
} catch {
  // Production deployments should provide environment variables directly.
}

const prisma = new PrismaClient();
const artifactRoot = process.env.CAD_ARTIFACT_DIR || '.cad-artifacts';
const apiKey = process.env.GEMINI_API_KEY;
const MAX_BUILD_ATTEMPTS = 3;
const workerHost = process.env.CAD_WORKER_HOST ?? '127.0.0.1';
const workerPort = Number(process.env.CAD_WORKER_PORT ?? 3020);
let processing = false;

let initialized = false;
async function initCad() { if (!initialized) { replicad.setOC(await openCascade()); initialized = true; } }

async function event(jobId, stage, agent, summary, tool, detail) {
  await withRunningJob(prisma, jobId, async (tx) => {
    const last = await tx.buildEvent.aggregate({ where: { jobId }, _max: { sequence: true } });
    await tx.buildEvent.create({ data: { jobId, sequence: (last._max.sequence ?? 0) + 1, stage, agent, summary, tool, detail } });
    const run = await tx.agentRun.findUnique({ where: { buildJobId: jobId }, select: { id: true } });
    if (!run) return;
    const lastEvent = await tx.agentEvent.aggregate({ where: { runId: run.id }, _max: { sequence: true } });
    await tx.agentEvent.create({ data: { runId: run.id, sequence: (lastEvent._max.sequence ?? 0) + 1, type: stage, summary, payload: { agent, tool, detail } } });
    const status = stage === 'evaluate' ? AgentRunStatus.VALIDATING : AgentRunStatus.EXECUTING;
    await tx.agentRun.update({ where: { id: run.id }, data: { status, steps: { updateMany: { where: { status: { in: [AgentStepStatus.PENDING, AgentStepStatus.RUNNING] } }, data: { status: AgentStepStatus.RUNNING, agentName: agent, summary } } } } });
  });
}

function engineeringReport(revisionNumber, intent, plan, metrics, validation, generation) {
  const sources = generation?.references?.length ? `\n\n**Reference data:** ${generation.references.map((reference) => `[${reference.title}](${reference.uri})`).join(', ')}` : '';
  const notes = validation.findings.length ? `\n\n### Build notes\n\n${validation.findings.map((finding) => `- ${finding}`).join('\n')}` : '';
  return `## Revision ${revisionNumber} validated\n\n${plan.summary}\n\n### Engineering summary\n\n| Measure | Result |\n| --- | ---: |\n| Parts | ${metrics.partCount.toLocaleString()} |\n| Volume | ${metrics.volume.toLocaleString()} mm³ |\n| Surface area | ${metrics.surfaceArea.toLocaleString()} mm² |\n| Triangles | ${metrics.triangleCount.toLocaleString()} |\n| Quality score | ${validation.score}/100 |\n\nThe measured volume is computed from the closed BREP: $V = ${metrics.volume.toLocaleString()}\\,\\mathrm{mm^3}$.\n\n### Build path\n\n\`\`\`mermaid\nflowchart LR\n  A[Design intent] --> B[${intent.object.replace(/[\[\]]/g, '').slice(0, 48)}]\n  B --> C[Parametric BREP]\n  C --> D[OpenCascade validation]\n  D --> E[STEP + STL]\n\`\`\`\n\n**Design rationale:** ${plan.decision}${sources}${notes}\n\nThe source, structured plan, preview mesh, STEP, STL, and audit report are attached to this revision.`;
}
// Used only when no Gemini key is configured.
function fallbackCode(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('gear')) return "function main() { const teeth = 20, module = 2, thickness = 6, root = 18; let shape = makeCylinder(root, thickness); for (let i=0;i<teeth;i++) { const a=i*Math.PI*2/teeth; const x=Math.cos(a)*(root+1), y=Math.sin(a)*(root+1); shape=shape.fuse(makeBox([x-2,y-2,0],[x+2,y+2,thickness])); } return shape.cut(makeCylinder(5, thickness+2, [0,0,-1])); }";
  return "function main() { const width = 80, depth = 50, height = 64; const base = makeBaseBox(width, depth, 5).translate([-width/2,-depth/2,0]); const back = makeBaseBox(width, 5, height).translate([-width/2,depth/2-5,0]); const lip = makeBaseBox(width, 10, 10).translate([-width/2,-depth/2,0]); return base.fuse(back).fuse(lip); }";
}
async function saveArtifact(jobId, revisionId, kind, filename, mimeType, content) {
  await assertJobRunning(prisma, jobId);
  const bytes = content instanceof Uint8Array ? content : new TextEncoder().encode(content);
  const storageKey = join(revisionId, filename);
  await mkdir(join(artifactRoot, revisionId), { recursive: true });
  await writeFile(join(artifactRoot, storageKey), bytes);
  await prisma.artifact.upsert({ where: { revisionId_kind: { revisionId, kind } }, update: { filename, mimeType, storageKey, byteSize: bytes.byteLength }, create: { revisionId, kind, filename, mimeType, storageKey, byteSize: bytes.byteLength } });
}
function crc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function zipStore(entries) {
  const local = []; const central = []; let offset = 0;
  for (const [name, value] of entries) { const nameBytes = Buffer.from(name); const data = Buffer.isBuffer(value) ? value : Buffer.from(value); const crc = crc32(data); const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6); head.writeUInt16LE(0, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(0, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBytes.length, 26); head.writeUInt16LE(0, 28); local.push(head, nameBytes, data); const dir = Buffer.alloc(46); dir.writeUInt32LE(0x02014b50, 0); dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6); dir.writeUInt16LE(0, 8); dir.writeUInt16LE(0, 10); dir.writeUInt16LE(0, 12); dir.writeUInt16LE(0, 14); dir.writeUInt32LE(crc, 16); dir.writeUInt32LE(data.length, 20); dir.writeUInt32LE(data.length, 24); dir.writeUInt16LE(nameBytes.length, 28); dir.writeUInt16LE(0, 30); dir.writeUInt16LE(0, 32); dir.writeUInt16LE(0, 34); dir.writeUInt16LE(0, 36); dir.writeUInt32LE(0, 38); dir.writeUInt32LE(offset, 42); central.push(dir, nameBytes); offset += head.length + nameBytes.length + data.length; }
  const centralBytes = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16); return Buffer.concat([...local, centralBytes, end]);
}
function threeMf(preview) {
  const vertices = []; const triangles = []; let offset = 0;
  for (const part of preview.parts) { for (let i = 0; i < part.vertices.length; i += 3) vertices.push(`<vertex x="${part.vertices[i]}" y="${part.vertices[i + 1]}" z="${part.vertices[i + 2]}"/>`); for (let i = 0; i < part.triangles.length; i += 3) triangles.push(`<triangle v1="${part.triangles[i] + offset}" v2="${part.triangles[i + 1] + offset}" v3="${part.triangles[i + 2] + offset}"/>`); offset += part.vertices.length / 3; }
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>${vertices.join('')}</vertices><triangles>${triangles.join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
  return zipStore([('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'), ('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/></Relationships>'), ('3D/3dmodel.model', model)]);
}
async function processJob(job) {
  const run = await prisma.agentRun.findUnique({ where: { buildJobId: job.id }, select: { id: true } });
  try {
    await withRunningJob(prisma, job.id, async (tx) => {
      await tx.buildJob.update({ where: { id: job.id }, data: { startedAt: new Date() } });
      if (run) await tx.agentRun.update({ where: { id: run.id }, data: { status: AgentRunStatus.EXECUTING, startedAt: new Date(), subagents: { createMany: { data: [{ role: 'geometry planner', status: AgentStepStatus.RUNNING }, { role: 'Replicad author', status: AgentStepStatus.PENDING }, { role: 'validation agent', status: AgentStepStatus.PENDING }, { role: 'artifact generator', status: AgentStepStatus.PENDING }] } } } });
    });
    await initCad();
    await event(job.id, 'intent', 'intent agent', 'Converted the request into constrained engineering intent.', 'structured-output');
    const intent = inferDesignIntent(job.prompt);
    const plan = buildParametricPlan(intent);
    await event(job.id, 'plan', 'parametric planner', plan.summary, 'feature-plan', { decision: plan.decision, features: plan.features, dimensions: intent.dimensions, constraints: intent.constraints });

    // A prompt on an existing generated revision is an edit: hand Gemini the parent's source
    // instead of starting over. A direct ChiliCAD edit has no executable Replicad source; do not
    // pass its marker comment as if it were code. The lineage is still retained on the new run,
    // but the generation path is intentionally treated as a fresh editable source.
    const parent = job.parentId ? await prisma.revision.findFirst({ where: { id: job.parentId, projectId: job.projectId, isValid: true }, select: { sourceCode: true } }) : null;
    if (job.parentId && !parent) throw new Error('The selected editing base is unavailable or no longer ready. Choose a completed revision in this project before retrying.');
    const parentSource = parent?.sourceCode;
    const previousCode = parentSource && !parentSource.includes('This revision was edited directly in ChiliCAD') ? parentSource : undefined;
    if (parentSource && !previousCode) await event(job.id, 'intent', 'intent agent', 'The selected base was edited directly in ChiliCAD; generating a fresh editable Replicad source.', 'manual-base');
    let code;
    let generation = null;
    if (!apiKey) {
      if (job.parentId) throw new Error('AI editing is unavailable because the generation provider is not configured. Your selected revision is unchanged; configure the provider before retrying this edit.');
      code = fallbackCode(job.prompt);
      await event(job.id, 'generate', 'Replicad generator', 'No Gemini key configured; used the built-in template.', 'template');
    } else {
      generation = await generateCadCode({
        prompt: job.prompt,
        previousCode,
        apiKey,
        onStage: async (stage, data) => {
          if (stage === 'reference') return event(job.id, 'generate', 'reference agent', `Pulled real-world specifications from Wikipedia: ${data.title}.`, 'wikipedia', data);
          if (stage === 'draft') {
            // Reasoning is emitted as its own event so the UI can show it as a collapsible block.
            if (data.thoughts) await event(job.id, 'thinking', 'Replicad generator', data.thoughts, 'gemini-thoughts', { model: data.model, phase: 'draft' });
            return event(job.id, 'generate', 'Replicad generator', `Generated Replicad source with ${data.model}.`, 'gemini');
          }
          if (stage === 'fidelity') {
            if (data.thoughts) await event(job.id, 'thinking', 'fidelity reviewer', data.thoughts, 'gemini-thoughts', { model: data.model, phase: 'fidelity' });
            return event(job.id, 'generate', 'fidelity reviewer', data.skipped ? 'Skipped the fidelity review pass; using the first draft.' : `Reviewed the draft against real proportions and refined it with ${data.model}.`, 'gemini');
          }
        },
      });
      code = generation.code;
    }

    // Build, and on failure ask Gemini to fix the code from the error (instead of substituting a canned part).
    let result;
    for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt += 1) {
      try {
        await assertJobRunning(prisma, job.id);
        result = await buildFromCode(code, replicad);
        await assertJobRunning(prisma, job.id);
        if (!result.validation.valid) throw new Error(`Generated shape failed deterministic validation. ${result.validation.findings.join(' ')}`);
        break;
      }
      catch (error) {
        if (error instanceof JobStoppedError) throw error;
        const message = describeError(error);
        if (attempt === MAX_BUILD_ATTEMPTS || !apiKey) throw new Error(message);
        await event(job.id, 'repair', 'repair agent', 'The build failed; asking Gemini to fix the generated code.', 'gemini-repair', { attempt, error: message.slice(0, 400) });
        code = (await generateCadCode({ prompt: `The code failed to build with this error: ${message}\nFix the code so it builds and keep the design as close to the original as possible.`, previousCode: code, apiKey })).code;
      }
    }

    const { metrics, validation } = result;
    if (!validation.valid) throw new Error('Generated shape failed deterministic validation.');
    const revision = await withRunningJob(prisma, job.id, async (tx) => {
      // Serialize revision numbering for this project, including parallel workers.
      await tx.project.update({ where: { id: job.projectId }, data: { updatedAt: new Date() } });
      const last = await tx.revision.aggregate({ where: { projectId: job.projectId }, _max: { revisionNumber: true } });
      const staged = await tx.revision.create({ data: { projectId: job.projectId, revisionNumber: (last._max.revisionNumber ?? 0) + 1, parentId: job.parentId, prompt: job.prompt, intent, plan, sourceCode: code, metrics, validation, isValid: false } });
      await tx.buildJob.update({ where: { id: job.id }, data: { revisionId: staged.id } });
      return staged;
    });
    const nextNumber = revision.revisionNumber;
    await saveArtifact(job.id, revision.id, ArtifactKind.SOURCE, 'model.js', 'text/javascript', code);
    await saveArtifact(job.id, revision.id, ArtifactKind.INTENT, 'intent.json', 'application/json', JSON.stringify(intent, null, 2));
    await saveArtifact(job.id, revision.id, ArtifactKind.PLAN, 'plan.json', 'application/json', JSON.stringify(plan, null, 2));
    await saveArtifact(job.id, revision.id, ArtifactKind.PREVIEW_MESH, 'preview.json', 'application/json', JSON.stringify(result.preview));
    await event(job.id, 'preview.ready', 'preview renderer', 'Preview mesh is ready before precise STEP import.', 'mesh-preview', { triangleCount: metrics.triangleCount });
    if (result.step) await saveArtifact(job.id, revision.id, ArtifactKind.STEP, 'model.step', 'application/step', result.step);
    await saveArtifact(job.id, revision.id, ArtifactKind.STL, 'model.stl', 'model/stl', result.stl);
    await saveArtifact(job.id, revision.id, ArtifactKind.THREE_MF, 'model.3mf', 'model/3mf', threeMf(result.preview));
    // Real projected drawings from the built solids. Both are secondary artifacts: a failure is
    // recorded in the build notes and never fails the revision.
    const drawingShapes = (result.shapes ?? []).filter(Boolean);
    const projectRow = await prisma.project.findUnique({ where: { id: job.projectId }, select: { title: true } });
    const drawingMeta = { name: projectRow?.title ?? 'Model', revisionNumber: nextNumber, units: 'mm', volume: metrics.volume, surfaceArea: metrics.surfaceArea };
    const blueprint = drawingShapes.length ? buildBlueprint(replicad, drawingShapes, drawingMeta) : null;
    if (blueprint?.svg) {
      await saveArtifact(job.id, revision.id, ArtifactKind.BLUEPRINT_SVG, 'blueprint.svg', 'image/svg+xml', blueprint.svg);
      if (blueprint.pdf) await saveArtifact(job.id, revision.id, ArtifactKind.BLUEPRINT_PDF, 'blueprint.pdf', 'application/pdf', blueprint.pdf);
      if (blueprint.dxf) await saveArtifact(job.id, revision.id, ArtifactKind.BLUEPRINT_DXF, 'blueprint.dxf', 'application/dxf', blueprint.dxf);
      await event(job.id, 'drawing', 'drawing generator', `Projected ${blueprint.views.length} view${blueprint.views.length === 1 ? '' : 's'} at ${blueprint.scaleLabel}.`, 'hidden-line-removal', { views: blueprint.views, notes: blueprint.notes });
    } else if (drawingShapes.length) {
      await event(job.id, 'drawing', 'drawing generator', 'No projected drawing could be produced for this model.', 'hidden-line-removal', { notes: blueprint?.notes ?? [] });
    }
    const sketch = drawingShapes.length ? buildSketch(replicad, drawingShapes, drawingMeta) : null;
    if (sketch?.svg) {
      await saveArtifact(job.id, revision.id, ArtifactKind.SKETCH_SVG, 'sketch.svg', 'image/svg+xml', sketch.svg);
      if (sketch.dxf) await saveArtifact(job.id, revision.id, ArtifactKind.SKETCH_DXF, 'sketch.dxf', 'application/dxf', sketch.dxf);
      await event(job.id, 'drawing', 'sketch generator', `Sectioned ${sketch.views.length} profile${sketch.views.length === 1 ? '' : 's'}.`, 'section', { views: sketch.views, notes: sketch.notes });
    }
    await saveArtifact(job.id, revision.id, ArtifactKind.VALIDATION_REPORT, 'validation.json', 'application/json', JSON.stringify({ metrics, validation }, null, 2));
    await saveArtifact(job.id, revision.id, ArtifactKind.AUDIT, 'audit.json', 'application/json', JSON.stringify({ intent, plan, metrics, validation, parts: result.parts.map(({ name, color, volume, surfaceArea }) => ({ name, color, volume: Math.round(volume), surfaceArea: Math.round(surfaceArea) })), generation: generation && { model: generation.model, passes: generation.passes, references: generation.references } }, null, 2));
    await saveArtifact(job.id, revision.id, ArtifactKind.AGENT_REPORT, 'agent-report.md', 'text/markdown', engineeringReport(nextNumber, intent, plan, metrics, validation, generation));
    await event(job.id, 'evaluate', 'BREP evaluator', 'Build checks complete; finalizing saved outputs.', 'OpenCascade', { metrics, validation });
    await withRunningJob(prisma, job.id, async (tx) => {
      const artifacts = await tx.artifact.findMany({ where: { revisionId: revision.id }, select: { id: true, kind: true, mimeType: true } });
      const required = [ArtifactKind.SOURCE, ArtifactKind.INTENT, ArtifactKind.PLAN, ArtifactKind.PREVIEW_MESH, ArtifactKind.STL, ArtifactKind.THREE_MF, ArtifactKind.VALIDATION_REPORT, ArtifactKind.AUDIT, ArtifactKind.AGENT_REPORT];
      if (result.step) required.push(ArtifactKind.STEP);
      if (required.some((kind) => !artifacts.some((artifact) => artifact.kind === kind))) throw new Error('Required build artifacts are missing.');
      await tx.revision.update({ where: { id: revision.id }, data: { isValid: true } });
      if (run) await tx.agentOutput.createMany({ data: artifacts.map((artifact) => ({ runId: run.id, artifactId: artifact.id, kind: artifact.kind.toLowerCase(), mimeType: artifact.mimeType })) });
      await tx.chatMessage.create({ data: { conversation: { connectOrCreate: { where: { projectId: job.projectId }, create: { projectId: job.projectId } } }, role: 'assistant', content: engineeringReport(nextNumber, intent, plan, metrics, validation, generation), revisionId: revision.id } });
      await tx.buildJob.update({ where: { id: job.id }, data: { status: BuildStatus.SUCCEEDED, revisionId: revision.id, finishedAt: new Date() } });
      if (run) await tx.agentRun.update({ where: { id: run.id }, data: { status: AgentRunStatus.COMPLETED, finishedAt: new Date(), steps: { updateMany: { where: { status: { in: [AgentStepStatus.PENDING, AgentStepStatus.RUNNING] } }, data: { status: AgentStepStatus.COMPLETED, finishedAt: new Date() } } }, subagents: { updateMany: { where: { status: { in: [AgentStepStatus.PENDING, AgentStepStatus.RUNNING] } }, data: { status: AgentStepStatus.COMPLETED, summary: 'Build outputs saved.' } } } } });
    });
  } catch (error) {
    if (error instanceof JobStoppedError) return;
    const message = describeError(error);
    try {
      await withRunningJob(prisma, job.id, async (tx) => {
        await tx.buildJob.update({ where: { id: job.id }, data: { status: BuildStatus.FAILED, error: message, finishedAt: new Date() } });
        if (run) {
          const last = await tx.agentEvent.aggregate({ where: { runId: run.id }, _max: { sequence: true } });
          await tx.agentEvent.create({ data: { runId: run.id, sequence: (last._max.sequence ?? 0) + 1, type: 'failed', summary: 'Build failed before outputs were finalized.', payload: { detail: { message } } } });
          await tx.agentRun.update({ where: { id: run.id }, data: { status: AgentRunStatus.FAILED, error: message, finishedAt: new Date(), steps: { updateMany: { where: { status: { in: [AgentStepStatus.PENDING, AgentStepStatus.RUNNING] } }, data: { status: AgentStepStatus.FAILED, summary: message, error: message, finishedAt: new Date() } } }, subagents: { updateMany: { where: { status: { in: [AgentStepStatus.PENDING, AgentStepStatus.RUNNING] } }, data: { status: AgentStepStatus.FAILED, summary: message } } } } });
        }
      });
    } catch (failure) {
      if (!(failure instanceof JobStoppedError)) throw failure;
    }
  }
}
async function tick(requestedJobId = null) {
  if (processing) return;
  processing = true;
  try {
    const job = await prisma.buildJob.findFirst({ where: { ...(requestedJobId ? { id: requestedJobId } : {}), status: BuildStatus.QUEUED }, orderBy: { createdAt: 'asc' } });
    if (!job) return;
    const claimed = await prisma.buildJob.updateMany({ where: { id: job.id, status: BuildStatus.QUEUED }, data: { status: BuildStatus.RUNNING, claimedAt: new Date() } });
    if (claimed.count) await processJob(job);
  } finally {
    processing = false;
  }
}

const server = createServer((socket) => {
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const message = JSON.parse(line);
        if (message.type === 'run' && typeof message.jobId === 'string') void tick(message.jobId).catch((error) => console.error('TCP dispatch failed:', error));
      } catch (error) {
        console.error('Invalid worker socket message:', error);
      }
    }
  });
});
server.listen(workerPort, workerHost, () => console.log(`Agentic CAD worker listening on tcp://${workerHost}:${workerPort}.`));
server.on('error', (error) => console.error('Agentic CAD worker socket error:', error));
setInterval(() => tick().catch((error) => console.error('Worker tick failed', error)), 1_000);
await tick();
