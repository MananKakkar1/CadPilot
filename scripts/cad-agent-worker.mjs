/**
 * Dedicated CAD worker. Run in a separate container/process with a shared artifact volume:
 *   npm run cad:worker
 * The process has no HTTP listener and executes generated geometry only in a restricted VM.
 *
 * Generation (system prompt, Wikipedia grounding, model fallback chain, fidelity pass) lives in lib/cad/gemini-generate.mjs;
 * sandboxed execution, multi-part / raw-mesh support and exports live in lib/cad/build-runtime.mjs.
 */
import { PrismaClient, BuildStatus, ArtifactKind } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as replicad from 'replicad';
import openCascade from 'replicad-opencascadejs';
import { generateCadCode } from '../lib/cad/gemini-generate.mjs';
import { buildFromCode, describeError } from '../lib/cad/build-runtime.mjs';

const prisma = new PrismaClient();
const artifactRoot = process.env.CAD_ARTIFACT_DIR || '.cad-artifacts';
const apiKey = process.env.GEMINI_API_KEY;
const MAX_BUILD_ATTEMPTS = 3;

let initialized = false;
async function initCad() { if (!initialized) { replicad.setOC(await openCascade()); initialized = true; } }

async function event(jobId, stage, agent, summary, tool, detail) {
  const count = await prisma.buildEvent.count({ where: { jobId } });
  await prisma.buildEvent.create({ data: { jobId, sequence: count + 1, stage, agent, summary, tool, detail } });
}
function intentFor(prompt) { return { object: prompt.split(/[,.]/)[0].slice(0, 120), units: 'mm', dimensions: {}, constraints: ['valid closed BREP', 'editable dimensions'], materials: ['anodized aluminum'] }; }
function planFor(intent) { return { summary: `Build a parametric ${intent.object}.`, decision: 'Use parameterized BREP primitives and boolean operations so the result remains editable.', features: [{ name: 'primary-solid', operation: 'parametric-solid', parameters: {} }] }; }
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

    // A prompt on an existing revision is an edit: hand Gemini the parent's source instead of starting over.
    const parent = job.parentId ? await prisma.revision.findUnique({ where: { id: job.parentId }, select: { sourceCode: true } }) : null;
    let code;
    let generation = null;
    if (!apiKey) {
      code = fallbackCode(job.prompt);
      await event(job.id, 'generate', 'Replicad generator', 'No Gemini key configured; used the built-in template.', 'template');
    } else {
      generation = await generateCadCode({
        prompt: job.prompt,
        previousCode: parent?.sourceCode || undefined,
        apiKey,
        onStage: (stage, data) => {
          if (stage === 'reference') return event(job.id, 'generate', 'reference agent', `Pulled real-world specifications from Wikipedia: ${data.title}.`, 'wikipedia', data);
          if (stage === 'draft') return event(job.id, 'generate', 'Replicad generator', `Generated Replicad source with ${data.model}.`, 'gemini');
          if (stage === 'fidelity') return event(job.id, 'generate', 'fidelity reviewer', data.skipped ? 'Skipped the fidelity review pass; using the first draft.' : `Reviewed the draft against real proportions and refined it with ${data.model}.`, 'gemini');
        },
      });
      code = generation.code;
    }

    // Build, and on failure ask Gemini to fix the code from the error (instead of substituting a canned part).
    let result;
    for (let attempt = 1; attempt <= MAX_BUILD_ATTEMPTS; attempt += 1) {
      try { result = await buildFromCode(code, replicad); break; }
      catch (error) {
        const message = describeError(error);
        if (attempt === MAX_BUILD_ATTEMPTS || !apiKey) throw new Error(message);
        await event(job.id, 'repair', 'repair agent', 'The build failed; asking Gemini to fix the generated code.', 'gemini-repair', { attempt, error: message.slice(0, 400) });
        code = (await generateCadCode({ prompt: `The code failed to build with this error: ${message}\nFix the code so it builds and keep the design as close to the original as possible.`, previousCode: code, apiKey })).code;
      }
    }

    const { metrics, validation } = result;
    if (!validation.valid) throw new Error('Generated shape failed deterministic validation.');
    const nextNumber = (await prisma.revision.count({ where: { projectId: job.projectId } })) + 1;
    const revision = await prisma.revision.create({ data: { projectId: job.projectId, revisionNumber: nextNumber, parentId: job.parentId, prompt: job.prompt, intent, plan, sourceCode: code, metrics, validation, isValid: true } });
    await saveArtifact(revision.id, ArtifactKind.SOURCE, 'model.js', 'text/javascript', code);
    await saveArtifact(revision.id, ArtifactKind.INTENT, 'intent.json', 'application/json', JSON.stringify(intent, null, 2));
    await saveArtifact(revision.id, ArtifactKind.PLAN, 'plan.json', 'application/json', JSON.stringify(plan, null, 2));
    await saveArtifact(revision.id, ArtifactKind.PREVIEW_MESH, 'preview.json', 'application/json', JSON.stringify(result.preview));
    if (result.step) await saveArtifact(revision.id, ArtifactKind.STEP, 'model.step', 'application/step', result.step);
    await saveArtifact(revision.id, ArtifactKind.STL, 'model.stl', 'model/stl', result.stl);
    await saveArtifact(revision.id, ArtifactKind.AUDIT, 'audit.json', 'application/json', JSON.stringify({ intent, plan, metrics, validation, parts: result.parts.map(({ name, color, volume, surfaceArea }) => ({ name, color, volume: Math.round(volume), surfaceArea: Math.round(surfaceArea) })), generation: generation && { model: generation.model, passes: generation.passes, references: generation.references } }, null, 2));
    await prisma.chatMessage.create({ data: { conversation: { connectOrCreate: { where: { projectId: job.projectId }, create: { projectId: job.projectId } } }, role: 'assistant', content: engineeringReport(nextNumber, intent, plan, metrics, validation, generation), revisionId: revision.id } });
    await event(job.id, 'evaluate', 'BREP evaluator', 'Validated the model and generated STEP, STL, preview, and audit files.', 'OpenCascade', { metrics, validation });
    await prisma.buildJob.update({ where: { id: job.id }, data: { status: BuildStatus.SUCCEEDED, revisionId: revision.id, finishedAt: new Date() } });
  } catch (error) {
    const message = describeError(error);
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
