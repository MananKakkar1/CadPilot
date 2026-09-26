import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RevisionRouteError, parseLabel, requireOwnedRevision, revisionErrorResponse } from '@/lib/revisions';

export const runtime = 'nodejs';

// Mirrors scripts/cad-agent-worker.mjs and the ChiliCAD import: every artifact for a revision lives
// under <artifactRoot>/<revisionId>/<filename>, so a hard delete can reclaim that whole folder.
const artifactRoot = process.env.CAD_ARTIFACT_DIR || '.cad-artifacts';

/** Rename/label a revision. */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string; revisionId: string }> }) {
  try {
    const { slug, revisionId } = await params;
    const { revision } = await requireOwnedRevision(slug, revisionId);
    const body = await request.json().catch(() => { throw new RevisionRouteError('A JSON body with a label is required.', 400); });
    if (!('label' in body)) throw new RevisionRouteError('A label field is required.', 400);
    const label = parseLabel(body.label);
    const updated = await prisma.revision.update({ where: { id: revision.id }, data: { label } });
    return NextResponse.json({ revision: updated });
  } catch (error) { return revisionErrorResponse(error, 'Unable to rename this revision.'); }
}

/**
 * Hard delete. Deliberately narrow: this repo prefers a recoverable archive, so a revision must
 * already be archived, must not be published, must not be the last valid revision, and must not
 * have children (deleting it would silently sever their lineage).
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ slug: string; revisionId: string }> }) {
  try {
    const { slug, revisionId } = await params;
    const { project, revision } = await requireOwnedRevision(slug, revisionId);
    if (!revision.archivedAt) throw new RevisionRouteError('Archive this revision before deleting it.', 409);
    if (project.publishedRevisionId === revision.id) throw new RevisionRouteError('This revision is published. Unpublish the project before deleting it.', 409);
    const artifacts = await prisma.artifact.findMany({ where: { revisionId: revision.id }, select: { storageKey: true } });
    await prisma.$transaction(async (tx) => {
      if (await tx.revision.count({ where: { parentId: revision.id } })) throw new RevisionRouteError('Other revisions branch from this one. Keep it archived so their history stays intact.', 409);
      if (revision.isValid && await tx.revision.count({ where: { projectId: project.id, isValid: true, id: { not: revision.id } } }) === 0) throw new RevisionRouteError('This is the only validated revision in the project.', 409);
      await tx.revision.delete({ where: { id: revision.id } }); // Artifact rows cascade from the FK.
    });
    // Files are reclaimed after the row is gone: a storage hiccup must not resurrect a deleted revision.
    let filesRemoved = true;
    try {
      for (const artifact of artifacts) await rm(join(artifactRoot, artifact.storageKey), { force: true });
      await rm(join(artifactRoot, revision.id), { recursive: true, force: true });
    } catch { filesRemoved = false; }
    return NextResponse.json({ deleted: true, revisionId: revision.id, artifactsDeleted: artifacts.length, filesRemoved });
  } catch (error) { return revisionErrorResponse(error, 'Unable to delete this revision.'); }
}
