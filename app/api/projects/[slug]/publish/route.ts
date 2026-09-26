import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectOwner } from '@/lib/projects';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params; const { project } = await requireProjectOwner(slug);
    const { revisionId } = await request.json();
    if (typeof revisionId !== 'string' || !revisionId.trim()) return NextResponse.json({ error: 'A revision ID is required.' }, { status: 400 });
    const revision = await prisma.revision.findFirst({ where: { id: revisionId, projectId: project.id, isValid: true } });
    if (!revision) return NextResponse.json({ error: 'Choose a validated revision before publishing.' }, { status: 400 });
    const validation = revision.validation && typeof revision.validation === 'object' ? revision.validation as { complete?: boolean; warnings?: unknown } : {};
    if (validation.complete !== true) return NextResponse.json({ error: 'This revision has no confirmed complete export validation. Rebuild or re-import it before publishing.' }, { status: 400 });
    if (!Array.isArray(validation.warnings) || validation.warnings.length > 0) return NextResponse.json({ error: 'Resolve build findings before publishing this revision.' }, { status: 400 });
    const updated = await prisma.project.update({ where: { id: project.id }, data: { visibility: 'PUBLIC', publishedRevisionId: revision.id } });
    return NextResponse.json({ project: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to publish project.' }, { status: 400 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { project } = await requireProjectOwner(slug);
    const updated = await prisma.project.update({ where: { id: project.id }, data: { visibility: 'PRIVATE', publishedRevisionId: null } });
    return NextResponse.json({ project: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to make project private.' }, { status: 400 }); }
}
