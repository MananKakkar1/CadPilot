import { AgentRunStatus, BuildStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/projects';

export async function POST(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  const { runId } = await params;
  const run = await prisma.agentRun.findFirst({ where: { id: runId, project: { ownerId: user.id } }, select: { id: true, buildJobId: true, status: true } });
  if (!run) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(run.status)) return NextResponse.json({ error: 'Run is already finished.' }, { status: 409 });
  const updated = await prisma.$transaction(async (tx) => {
    if (run.buildJobId) await tx.buildJob.updateMany({ where: { id: run.buildJobId, status: { in: [BuildStatus.QUEUED, BuildStatus.RUNNING] } }, data: { status: BuildStatus.CANCELLED, finishedAt: new Date() } });
    await tx.agentRun.update({ where: { id: run.id }, data: { status: AgentRunStatus.CANCELLED, cancelledAt: new Date(), steps: { updateMany: { where: { status: { in: ['PENDING', 'RUNNING', 'AWAITING_APPROVAL'] } }, data: { status: 'CANCELLED', finishedAt: new Date() } } }, subagents: { updateMany: { where: { status: { in: ['PENDING', 'RUNNING', 'AWAITING_APPROVAL'] } }, data: { status: 'CANCELLED', updatedAt: new Date() } } } } });
    const lastEvent = await tx.agentEvent.aggregate({ where: { runId: run.id }, _max: { sequence: true } });
    await tx.agentEvent.create({ data: { runId: run.id, sequence: (lastEvent._max.sequence ?? 0) + 1, type: 'run.cancelled', summary: 'Run cancelled by the user.' } });
    return tx.agentRun.findUnique({ where: { id: run.id } });
  });
  return NextResponse.json({ run: updated });
}
