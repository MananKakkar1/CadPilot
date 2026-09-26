import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RevisionRouteError, revisionErrorResponse } from '@/lib/revisions';
import { requireProjectOwner } from '@/lib/projects';

export const runtime = 'nodejs';

// Walking `parentId` is cheap but a corrupted cycle would hang the request, so the walk is capped.
const MAX_LINEAGE_WALK = 200;

type Metrics = { volume?: number; surfaceArea?: number; triangleCount?: number; partCount?: number };
type Validation = { valid?: boolean; complete?: boolean; warnings?: string[] };

const asMetrics = (value: unknown): Metrics => (value && typeof value === 'object' ? value as Metrics : {});
const asValidation = (value: unknown): Validation => (value && typeof value === 'object' ? value as Validation : {});

/** Absolute + percentage delta, or null when either side is missing the measurement. */
function delta(a: unknown, b: unknown) {
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const absolute = b - a;
  // A 0 -> n change has no meaningful percentage, so report it as null rather than Infinity.
  const percent = a === 0 ? null : Number(((absolute / Math.abs(a)) * 100).toFixed(2));
  return { from: a, to: b, absolute: Number(absolute.toFixed(6)), percent };
}

/** Is `ancestorId` reachable by walking parents up from `fromId`? Returns the step distance. */
async function ancestorDistance(fromId: string, ancestorId: string, parents: Map<string, string | null>) {
  let current: string | null = fromId;
  for (let step = 0; step < MAX_LINEAGE_WALK; step += 1) {
    current = parents.get(current!) ?? null;
    if (!current) return null;
    if (current === ancestorId) return step + 1;
  }
  return null;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { project } = await requireProjectOwner(slug);
    const url = new URL(request.url);
    const aId = url.searchParams.get('a');
    const bId = url.searchParams.get('b');
    if (!aId || !bId) throw new RevisionRouteError('Both `a` and `b` revision IDs are required.', 400);
    if (aId === bId) throw new RevisionRouteError('Pick two different revisions to compare.', 400);

    const found = await prisma.revision.findMany({
      where: { id: { in: [aId, bId] }, projectId: project.id },
      include: { artifacts: { select: { kind: true } } },
    });
    const a = found.find((item) => item.id === aId);
    const b = found.find((item) => item.id === bId);
    if (!a || !b) throw new RevisionRouteError('Revision not found.', 404);

    const aMetrics = asMetrics(a.metrics);
    const bMetrics = asMetrics(b.metrics);
    const aValidation = asValidation(a.validation);
    const bValidation = asValidation(b.validation);
    const aWarnings = Array.isArray(aValidation.warnings) ? aValidation.warnings : [];
    const bWarnings = Array.isArray(bValidation.warnings) ? bValidation.warnings : [];
    const aKinds = new Set(a.artifacts.map((item) => item.kind));
    const bKinds = new Set(b.artifacts.map((item) => item.kind));

    // One query for the whole project's lineage beats walking parent-by-parent over the network.
    const lineageRows = await prisma.revision.findMany({ where: { projectId: project.id }, select: { id: true, parentId: true } });
    const parents = new Map(lineageRows.map((row) => [row.id, row.parentId]));
    const bFromA = await ancestorDistance(b.id, a.id, parents);
    const aFromB = await ancestorDistance(a.id, b.id, parents);

    const aLines = a.sourceCode.split('\n').length;
    const bLines = b.sourceCode.split('\n').length;

    return NextResponse.json({
      a: { id: a.id, revisionNumber: a.revisionNumber, label: a.label, prompt: a.prompt, isValid: a.isValid, createdAt: a.createdAt, archivedAt: a.archivedAt },
      b: { id: b.id, revisionNumber: b.revisionNumber, label: b.label, prompt: b.prompt, isValid: b.isValid, createdAt: b.createdAt, archivedAt: b.archivedAt },
      metrics: {
        volume: delta(aMetrics.volume, bMetrics.volume),
        surfaceArea: delta(aMetrics.surfaceArea, bMetrics.surfaceArea),
        triangleCount: delta(aMetrics.triangleCount, bMetrics.triangleCount),
        partCount: delta(aMetrics.partCount, bMetrics.partCount),
      },
      validation: {
        valid: { from: a.isValid, to: b.isValid, changed: a.isValid !== b.isValid },
        complete: { from: aValidation.complete ?? null, to: bValidation.complete ?? null },
        warningsAdded: bWarnings.filter((item) => !aWarnings.includes(item)),
        warningsResolved: aWarnings.filter((item) => !bWarnings.includes(item)),
      },
      artifacts: {
        onlyInA: [...aKinds].filter((kind) => !bKinds.has(kind)).sort(),
        onlyInB: [...bKinds].filter((kind) => !aKinds.has(kind)).sort(),
        shared: [...aKinds].filter((kind) => bKinds.has(kind)).sort(),
      },
      lineage: {
        // null on both sides means they sit on separate branches with no direct ancestry.
        aIsAncestorOfB: bFromA !== null,
        bIsAncestorOfA: aFromB !== null,
        distance: bFromA ?? aFromB ?? null,
      },
      // Full text diffing is left to the client; the server only reports that they differ.
      source: { changed: a.sourceCode !== b.sourceCode, fromLines: aLines, toLines: bLines, lineDelta: bLines - aLines },
    });
  } catch (error) { return revisionErrorResponse(error, 'Unable to compare these revisions.'); }
}
