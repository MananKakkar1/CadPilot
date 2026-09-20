import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectOwner } from '@/lib/projects';

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { project } = await requireProjectOwner(slug);
    const detail = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { owner: { select: { username: true, profile: true } }, revisions: { include: { artifacts: true }, orderBy: { revisionNumber: 'desc' } }, jobs: { include: { events: { orderBy: { sequence: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 1 }, conversations: { include: { messages: { orderBy: { createdAt: 'asc' } } } }, agentRuns: { include: { steps: { orderBy: { sequence: 'asc' } }, subagents: { orderBy: { createdAt: 'asc' } }, approvals: { orderBy: { createdAt: 'desc' }, take: 3 }, outputs: { include: { artifact: true }, orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 6 } } });
    return NextResponse.json({ project: detail });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Project not found.' }, { status: 404 }); }
}
