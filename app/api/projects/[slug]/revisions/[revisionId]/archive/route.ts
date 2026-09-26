import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RevisionRouteError, requireOwnedRevision, revisionErrorResponse } from '@/lib/revisions';

export const runtime = 'nodejs';

/** Archive a revision (soft delete). History is kept; DELETE on this route unarchives it. */
export async function POST(_: Request, { params }: { params: Promise<{ slug: string; revisionId: string }> }) {
  try {
    const { slug, revisionId } = await params;
    const { project, revision } = await requireOwnedRevision(slug, revisionId);
    if (revision.archivedAt) return NextResponse.json({ revision, alreadyArchived: true });
    if (project.publishedRevisionId === revision.id) throw new RevisionRouteError('This revision is published. Unpublish the project before archiving it.', 409);
    const archived = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction so a concurrent publish or archive cannot slip past the guards.
      const live = await tx.project.findUniqueOrThrow({ where: { id: project.id }, select: { publishedRevisionId: true } });
      if (live.publishedRevisionId === revision.id) throw new RevisionRouteError('This revision is published. Unpublish the project before archiving it.', 409);
      if (revision.isValid && await tx.revision.count({ where: { projectId: project.id, isValid: true, archivedAt: null, id: { not: revision.id } } }) === 0) throw new RevisionRouteError('This is the only validated revision left. Build another before archiving it.', 409);
      return tx.revision.update({ where: { id: revision.id }, data: { archivedAt: new Date() } });
    });
    return NextResponse.json({ revision: archived });
  } catch (error) { return revisionErrorResponse(error, 'Unable to archive this revision.'); }
}

/** Unarchive (restore to the visible history). */
export async function DELETE(_: Request, { params }: { params: Promise<{ slug: string; revisionId: string }> }) {
  try {
    const { slug, revisionId } = await params;
    const { revision } = await requireOwnedRevision(slug, revisionId);
    if (!revision.archivedAt) return NextResponse.json({ revision, alreadyActive: true });
    const restored = await prisma.revision.update({ where: { id: revision.id }, data: { archivedAt: null } });
    return NextResponse.json({ revision: restored });
  } catch (error) { return revisionErrorResponse(error, 'Unable to unarchive this revision.'); }
}
