import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ArtifactKind } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectOwner } from '@/lib/projects';

// Mirrors scripts/cad-agent-worker.mjs's storage convention so /api/artifacts/[id] can serve
// these files identically regardless of which path produced the revision.
const artifactRoot = process.env.CAD_ARTIFACT_DIR || '.cad-artifacts';
const MAX_TRIANGLES = 400_000;

let replicadReady: Promise<typeof import('replicad')> | null = null;
async function loadReplicad() {
  if (!replicadReady) {
    replicadReady = Promise.all([import('replicad'), import('replicad-opencascadejs')]).then(async ([replicad, openCascade]) => {
      replicad.setOC(await openCascade.default());
      return replicad;
    });
  }
  return replicadReady;
}

async function saveArtifact(revisionId: string, kind: ArtifactKind, filename: string, mimeType: string, content: string | Uint8Array) {
  const bytes = content instanceof Uint8Array ? content : new TextEncoder().encode(content);
  const storageKey = join(revisionId, filename);
  await mkdir(join(artifactRoot, revisionId), { recursive: true });
  await writeFile(join(artifactRoot, storageKey), bytes);
  await prisma.artifact.upsert({
    where: { revisionId_kind: { revisionId, kind } },
    update: { filename, mimeType, storageKey, byteSize: bytes.byteLength },
    create: { revisionId, kind, filename, mimeType, storageKey, byteSize: bytes.byteLength },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { project } = await requireProjectOwner(slug);
    const body = await request.json().catch(() => ({}));
    const step = typeof body.step === 'string' ? body.step : '';
    if (!step.trim()) return NextResponse.json({ error: 'No STEP data was received from ChiliCAD.' }, { status: 400 });

    const parentId = typeof body.parentRevisionId === 'string' ? body.parentRevisionId : null;
    if (parentId && !(await prisma.revision.findFirst({ where: { id: parentId, projectId: project.id } }))) {
      return NextResponse.json({ error: 'Invalid parent revision.' }, { status: 400 });
    }

    const replicad = await loadReplicad();
    // importSTEP's return type covers every shape kind a STEP file could contain (vertex, edge,
    // face, solid...); mesh()/measureVolume()/measureArea() all accept any of them at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shape = (await replicad.importSTEP(new Blob([step], { type: 'application/step' }))) as any;
    const mesh = shape.mesh({ tolerance: 0.12, angularTolerance: 20 });
    const triangleCount = mesh.triangles.length / 3;
    if (triangleCount > MAX_TRIANGLES) {
      return NextResponse.json({ error: `This model has ${triangleCount.toLocaleString()} triangles, over the ${MAX_TRIANGLES.toLocaleString()} limit.` }, { status: 400 });
    }
    const [min, max] = shape.boundingBox.bounds;
    const metrics = { volume: Math.round(replicad.measureVolume(shape)), surfaceArea: Math.round(replicad.measureArea(shape)), partCount: 1, triangleCount, bounds: { min, max } };
    const validation = {
      valid: metrics.volume > 0,
      score: metrics.volume > 0 ? 100 : 0,
      findings: metrics.volume > 0 ? ['Imported a closed BREP from ChiliCAD.', 'Mesh is within the configured limit.'] : ['Imported solid has no measurable volume.'],
    };
    if (!validation.valid) return NextResponse.json({ error: 'The edited model has no measurable volume.' }, { status: 400 });

    const nextNumber = (await prisma.revision.count({ where: { projectId: project.id } })) + 1;
    const revision = await prisma.revision.create({
      data: {
        projectId: project.id,
        revisionNumber: nextNumber,
        parentId,
        prompt: 'Edited directly in ChiliCAD',
        intent: { object: 'ChiliCAD edit', units: 'mm', dimensions: {}, constraints: ['valid closed BREP'], materials: [] },
        plan: { summary: 'Geometry edited by hand in the ChiliCAD editor, then imported back.', decision: 'No generated source — the BREP came directly from the editor.', features: [] },
        sourceCode: '// This revision was edited directly in ChiliCAD; there is no generated source for it.',
        metrics,
        validation,
        isValid: true,
      },
    });

    await saveArtifact(revision.id, ArtifactKind.STEP, 'model.step', 'application/step', step);
    await saveArtifact(revision.id, ArtifactKind.STL, 'model.stl', 'model/stl', new Uint8Array(await shape.blobSTL({ binary: true }).arrayBuffer()));
    await saveArtifact(revision.id, ArtifactKind.PREVIEW_MESH, 'preview.json', 'application/json', JSON.stringify(mesh));
    await saveArtifact(revision.id, ArtifactKind.AUDIT, 'audit.json', 'application/json', JSON.stringify({ metrics, validation }, null, 2));
    await saveArtifact(revision.id, ArtifactKind.VALIDATION_REPORT, 'validation.json', 'application/json', JSON.stringify({ metrics, validation }, null, 2));

    await prisma.chatMessage.create({
      data: {
        conversation: { connectOrCreate: { where: { projectId: project.id }, create: { projectId: project.id } } },
        role: 'assistant',
        content: `## Revision ${nextNumber} — edited in ChiliCAD\n\nThis revision was imported from a manual edit in the ChiliCAD editor.\n\n| Measure | Result |\n| --- | ---: |\n| Volume | ${metrics.volume.toLocaleString()} mm³ |\n| Surface area | ${metrics.surfaceArea.toLocaleString()} mm² |\n| Triangles | ${metrics.triangleCount.toLocaleString()} |`,
        revisionId: revision.id,
      },
    });

    return NextResponse.json({ revision }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to import this model.' }, { status: 400 });
  }
}
