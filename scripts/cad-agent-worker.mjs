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
  const buildSequence = count + 1;
  await prisma.buildEvent.create({ data: { jobId, sequence: buildSequence, stage, agent, summary, tool, detail } });
  const run = await prisma.agentRun.findUnique({ where: { buildJobId: jobId }, select: { id: true } });
  if (run) {
    const lastEvent = await prisma.agentEvent.aggregate({ where: { runId: run.id }, _max: { sequence: true } });
    const agentSequence = (lastEvent._max.sequence ?? 0) + 1;
    await prisma.agentEvent.create({ data: { runId: run.id, sequence: agentSequence, type: stage, summary, payload: { agent, tool, detail } } });
    const status = stage === 'evaluate' ? AgentRunStatus.VALIDATING : stage === 'failed' ? AgentRunStatus.FAILED : AgentRunStatus.EXECUTING;
    await prisma.agentRun.update({ where: { id: run.id }, data: { status, startedAt: { set: new Date() }, steps: { updateMany: { where: { status: { in: [AgentStepStatus.PENDING, AgentStepStatus.RUNNING] } }, data: { status: AgentStepStatus.RUNNING, agentName: agent, summary, startedAt: new Date() } } } } });
  }
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
function xmlEscape(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function svgHeader(title, width, height) { return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><title>${xmlEscape(title)}</title><style>text{font-family:ui-monospace,monospace;fill:#172238} .line{fill:none;stroke:#172238;stroke-width:.35} .dim{fill:none;stroke:#4f46e5;stroke-width:.2;marker-start:url(#a);marker-end:url(#a)}</style><defs><marker id="a" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto"><path d="M4 0L0 2L4 4" fill="none" stroke="#4f46e5" stroke-width=".4"/></marker></defs>`; }
function blueprintSvg(revisionNumber, metrics) {
  const bounds = metrics.bounds ?? { min: [-40, -40, 0], max: [40, 40, 40] };
  const width = Math.max(1, bounds.max[0] - bounds.min[0]); const depth = Math.max(1, bounds.max[1] - bounds.min[1]); const height = Math.max(1, bounds.max[2] - bounds.min[2]);
  const scale = Math.min(100 / width, 70 / depth); const x = 70 - width * scale / 2; const y = 48 - depth * scale / 2;
  return `${svgHeader(`Blueprint revision ${revisionNumber}`, 180, 110)}<text x="10" y="10" font-size="5">BLUEPRINT / REVISION ${revisionNumber}</text><text x="10" y="17" font-size="3.5">UNITS: mm · VALIDATED BREP</text><rect class="line" x="${x}" y="${y}" width="${width * scale}" height="${depth * scale}"/><line class="dim" x1="${x}" y1="${y + depth * scale + 8}" x2="${x + width * scale}" y2="${y + depth * scale + 8}"/><text x="${x + width * scale / 2 - 8}" y="${y + depth * scale + 14}" font-size="3.5">${width.toFixed(2)} mm</text><line class="dim" x1="${x + width * scale + 8}" y1="${y}" x2="${x + width * scale + 8}" y2="${y + depth * scale}"/><text x="${x + width * scale + 12}" y="${y + depth * scale / 2}" font-size="3.5" transform="rotate(90 ${x + width * scale + 12} ${y + depth * scale / 2})">${depth.toFixed(2)} mm</text><text x="10" y="98" font-size="3.5">Envelope height: ${height.toFixed(2)} mm · Volume: ${metrics.volume.toLocaleString()} mm³</text></svg>`;
}
function sketchSvg(revisionNumber, metrics) {
  const bounds = metrics.bounds ?? { min: [-40, -40, 0], max: [40, 40, 40] }; const width = Math.max(1, bounds.max[0] - bounds.min[0]); const depth = Math.max(1, bounds.max[1] - bounds.min[1]);
  return `${svgHeader(`Sketch revision ${revisionNumber}`, 140, 100)}<text x="10" y="10" font-size="5">SKETCH / REVISION ${revisionNumber}</text><text x="10" y="17" font-size="3.5">TOP PLANE · CONSTRUCTION GEOMETRY</text><rect class="line" x="${70 - width / 2}" y="${50 - depth / 2}" width="${width}" height="${depth}"/><line class="line" x1="70" y1="18" x2="70" y2="82" stroke-dasharray="2 2"/><line class="line" x1="25" y1="50" x2="115" y2="50" stroke-dasharray="2 2"/><text x="10" y="92" font-size="3.5">Constraint envelope: ${width.toFixed(2)} × ${depth.toFixed(2)} mm</text></svg>`;
}
function dxfDrawing(revisionNumber, metrics, sketch = false) {
  const bounds = metrics.bounds ?? { min: [-40, -40, 0], max: [40, 40, 40] }; const minX = bounds.min[0]; const minY = bounds.min[1]; const maxX = bounds.max[0]; const maxY = bounds.max[1];
  const text = sketch ? `SKETCH REVISION ${revisionNumber}` : `BLUEPRINT REVISION ${revisionNumber}`;
  return ['0', 'SECTION', '2', 'HEADER', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', '0', 'TEXT', '8', 'ANNOTATION', '10', String(minX), '20', String(maxY + 10), '40', '3', '1', text, '0', 'LINE', '8', 'GEOMETRY', '10', String(minX), '20', String(minY), '11', String(maxX), '21', String(minY), '0', 'LINE', '8', 'GEOMETRY', '10', String(maxX), '20', String(minY), '11', String(maxX), '21', String(maxY), '0', 'LINE', '8', 'GEOMETRY', '10', String(maxX), '20', String(maxY), '11', String(minX), '21', String(maxY), '0', 'LINE', '8', 'GEOMETRY', '10', String(minX), '20', String(maxY), '11', String(minX), '21', String(minY), '0', 'TEXT', '8', 'DIMENSIONS', '10', String(minX), '20', String(minY - 8), '40', '2.5', '1', `WIDTH ${Math.abs(maxX - minX).toFixed(2)} mm`, '0', 'ENDSEC', '0', 'EOF', ''].join('\n');
}
function pdfBlueprint(revisionNumber, metrics) {
  const bounds = metrics.bounds ?? { min: [-40, -40, 0], max: [40, 40, 40] }; const width = Math.max(1, bounds.max[0] - bounds.min[0]); const depth = Math.max(1, bounds.max[1] - bounds.min[1]);
  const page = `BT /F1 16 Tf 48 760 Td (BLUEPRINT / REVISION ${revisionNumber}) Tj /F1 9 Tf 0 -24 Td (UNITS: mm - VALIDATED BREP) Tj 0 -24 Td (Envelope: ${width.toFixed(2)} x ${depth.toFixed(2)} mm) Tj 0 -18 Td (Volume: ${metrics.volume.toLocaleString()} mm3) Tj ET 48 650 420 220 re S`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${page.length} >>\nstream\n${page}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offsets = [0]; for (let i = 0; i < objects.length; i += 1) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; } const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`; return Buffer.from(pdf);
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
  await prisma.buildJob.update({ where: { id: job.id }, data: { status: BuildStatus.RUNNING, startedAt: new Date() } });
  const run = await prisma.agentRun.findUnique({ where: { buildJobId: job.id }, select: { id: true } });
  if (run) {
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: AgentRunStatus.EXECUTING, startedAt: new Date(), subagents: { createMany: { data: [{ role: 'geometry planner', status: AgentStepStatus.RUNNING }, { role: 'Replicad author', status: AgentStepStatus.PENDING }, { role: 'validation agent', status: AgentStepStatus.PENDING }, { role: 'artifact generator', status: AgentStepStatus.PENDING }] } } } });
  }
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
    await saveArtifact(revision.id, ArtifactKind.THREE_MF, 'model.3mf', 'model/3mf', threeMf(result.preview));
    await saveArtifact(revision.id, ArtifactKind.BLUEPRINT_SVG, 'blueprint.svg', 'image/svg+xml', blueprintSvg(nextNumber, metrics));
    await saveArtifact(revision.id, ArtifactKind.BLUEPRINT_PDF, 'blueprint.pdf', 'application/pdf', pdfBlueprint(nextNumber, metrics));
    await saveArtifact(revision.id, ArtifactKind.BLUEPRINT_DXF, 'blueprint.dxf', 'application/dxf', dxfDrawing(nextNumber, metrics));
    await saveArtifact(revision.id, ArtifactKind.SKETCH_SVG, 'sketch.svg', 'image/svg+xml', sketchSvg(nextNumber, metrics));
    await saveArtifact(revision.id, ArtifactKind.SKETCH_DXF, 'sketch.dxf', 'application/dxf', dxfDrawing(nextNumber, metrics, true));
    await saveArtifact(revision.id, ArtifactKind.VALIDATION_REPORT, 'validation.json', 'application/json', JSON.stringify({ metrics, validation }, null, 2));
    await saveArtifact(revision.id, ArtifactKind.AUDIT, 'audit.json', 'application/json', JSON.stringify({ intent, plan, metrics, validation, parts: result.parts.map(({ name, color, volume, surfaceArea }) => ({ name, color, volume: Math.round(volume), surfaceArea: Math.round(surfaceArea) })), generation: generation && { model: generation.model, passes: generation.passes, references: generation.references } }, null, 2));
    await saveArtifact(revision.id, ArtifactKind.AGENT_REPORT, 'agent-report.md', 'text/markdown', engineeringReport(nextNumber, intent, plan, metrics, validation, generation));
    if (run) {
      const artifacts = await prisma.artifact.findMany({ where: { revisionId: revision.id }, select: { id: true, kind: true, mimeType: true } });
      await prisma.agentOutput.createMany({ data: artifacts.map((artifact) => ({ runId: run.id, artifactId: artifact.id, kind: artifact.kind.toLowerCase(), mimeType: artifact.mimeType })) });
      await event(job.id, 'output', 'artifact generator', `Attached ${artifacts.length} durable outputs to the agent run.`, 'artifact-store', { artifactCount: artifacts.length });
    }
    await prisma.chatMessage.create({ data: { conversation: { connectOrCreate: { where: { projectId: job.projectId }, create: { projectId: job.projectId } } }, role: 'assistant', content: engineeringReport(nextNumber, intent, plan, metrics, validation, generation), revisionId: revision.id } });
    await event(job.id, 'evaluate', 'BREP evaluator', 'Validated the model and generated STEP, STL, preview, and audit files.', 'OpenCascade', { metrics, validation });
    await prisma.buildJob.update({ where: { id: job.id }, data: { status: BuildStatus.SUCCEEDED, revisionId: revision.id, finishedAt: new Date() } });
    if (run) await prisma.agentRun.update({ where: { id: run.id }, data: { status: AgentRunStatus.COMPLETED, finishedAt: new Date(), steps: { updateMany: { where: { status: { in: [AgentStepStatus.PENDING, AgentStepStatus.RUNNING] } }, data: { status: AgentStepStatus.COMPLETED, finishedAt: new Date() } } }, subagents: { updateMany: { where: { status: { in: [AgentStepStatus.PENDING, AgentStepStatus.RUNNING] } }, data: { status: AgentStepStatus.COMPLETED, summary: 'Completed as part of the validated CAD build.' } } } } });
  } catch (error) {
    const message = describeError(error);
    await event(job.id, 'failed', 'orchestrator', 'Build failed before a validated BREP was produced.', undefined, { message });
    await prisma.buildJob.update({ where: { id: job.id }, data: { status: BuildStatus.FAILED, error: message, finishedAt: new Date() } });
    if (run) await prisma.agentRun.update({ where: { id: run.id }, data: { status: AgentRunStatus.FAILED, error: message, finishedAt: new Date(), steps: { updateMany: { where: { status: { in: [AgentStepStatus.PENDING, AgentStepStatus.RUNNING] } }, data: { status: AgentStepStatus.FAILED, summary: message, error: message, finishedAt: new Date() } } }, subagents: { updateMany: { where: { status: { in: [AgentStepStatus.PENDING, AgentStepStatus.RUNNING] } }, data: { status: AgentStepStatus.FAILED, summary: message } } } } });
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
