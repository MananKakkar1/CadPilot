import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parsePrompt } from '@/lib/cad/contracts';
import { requireProjectOwner } from '@/lib/projects';
import { queueBuild } from '@/lib/cad/queue-build';
import { notifyCadWorker } from '@/lib/cad/worker-socket';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { project } = await requireProjectOwner(slug);
    const body = await request.json().catch(() => ({}));
    const prompt = parsePrompt(body.prompt);
    const parentId = typeof body.parentRevisionId === 'string' ? body.parentRevisionId : null;
    if (parentId && !await prisma.revision.findFirst({ where: { id: parentId, projectId: project.id, isValid: true, archivedAt: null } })) return NextResponse.json({ error: 'Choose a completed revision as the editing base.' }, { status: 400 });
    const { job, run } = await prisma.$transaction((tx) => queueBuild(tx, { projectId: project.id, prompt, parentId }));
    const workerConnected = await notifyCadWorker(job.id);
    return NextResponse.json({ job, run, workerConnected }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create build.' }, { status: 400 }); }
}
