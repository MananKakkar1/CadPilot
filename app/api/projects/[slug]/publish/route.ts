import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectOwner } from '@/lib/projects';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params; const { project } = await requireProjectOwner(slug);
    const { revisionId } = await request.json();
    const revision = await prisma.revision.findFirst({ where: { id: revisionId, projectId: project.id, isValid: true } });
    if (!revision) return NextResponse.json({ error: 'Choose a validated revision before publishing.' }, { status: 400 });
    const updated = await prisma.project.update({ where: { id: project.id }, data: { visibility: 'PUBLIC', publishedRevisionId: revision.id } });
    return NextResponse.json({ project: updated });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to publish project.' }, { status: 400 }); }
}
