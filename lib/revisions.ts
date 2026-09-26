import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectOwner } from '@/lib/projects';

export const MAX_LABEL_LENGTH = 80;

/** A route-level failure that already knows which 4xx status it deserves. */
export class RevisionRouteError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'RevisionRouteError'; }
}

/** `null`, `''` and whitespace all clear the label; anything else must be a short trimmed string. */
export function parseLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new RevisionRouteError('A revision label must be a string or null.', 400);
  const label = value.trim();
  if (!label) return null;
  if (label.length > MAX_LABEL_LENGTH) throw new RevisionRouteError(`A revision label must be ${MAX_LABEL_LENGTH} characters or fewer.`, 400);
  return label;
}

/** Ownership first, then scope the revision to that project so a foreign ID is indistinguishable from a missing one. */
export async function requireOwnedRevision(slug: string, revisionId: string) {
  const { user, project } = await requireProjectOwner(slug);
  if (typeof revisionId !== 'string' || !revisionId.trim()) throw new RevisionRouteError('A revision ID is required.', 400);
  const revision = await prisma.revision.findFirst({ where: { id: revisionId, projectId: project.id } });
  if (!revision) throw new RevisionRouteError('Revision not found.', 404);
  return { user, project, revision };
}

export function revisionErrorResponse(error: unknown, fallback: string) {
  if (error instanceof RevisionRouteError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : fallback;
  if (message === 'Authentication required.') return NextResponse.json({ error: message }, { status: 401 });
  if (message === 'Project not found.') return NextResponse.json({ error: message }, { status: 404 });
  return NextResponse.json({ error: message }, { status: 400 });
}
