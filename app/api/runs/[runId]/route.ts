import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/projects';

export async function GET(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  const { runId } = await params;
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, project: { ownerId: user.id } },
    include: {
      steps: { orderBy: { sequence: 'asc' } },
      events: { orderBy: { sequence: 'asc' } },
      subagents: { orderBy: { createdAt: 'asc' } },
      approvals: { orderBy: { createdAt: 'desc' } },
      outputs: { include: { artifact: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!run) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  return NextResponse.json({ run });
}
