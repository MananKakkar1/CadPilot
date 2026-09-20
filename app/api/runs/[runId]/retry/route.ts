import { AgentRunStatus, BuildStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/projects';

export async function POST(_: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  const { runId } = await params;
  const run = await prisma.agentRun.findFirst({ where: { id: runId, project: { ownerId: user.id } }, select: { id: true, projectId: true, prompt: true, status: true } });
  if (!run) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  if (!['FAILED', 'CANCELLED'].includes(run.status)) return NextResponse.json({ error: 'Only failed or cancelled runs can be retried.' }, { status: 409 });
  const result = await prisma.$transaction(async (tx) => {
    const job = await tx.buildJob.create({ data: { projectId: run.projectId, prompt: run.prompt, status: BuildStatus.QUEUED } });
    const updated = await tx.agentRun.update({ where: { id: run.id }, data: { buildJobId: job.id, status: AgentRunStatus.QUEUED, error: null, cancelledAt: null } });
    await tx.buildEvent.create({ data: { jobId: job.id, sequence: 1, stage: 'queued', agent: 'orchestrator', summary: 'Retry queued for the isolated CAD worker.' } });
    return { job, run: updated };
  });
  return NextResponse.json(result, { status: 202 });
}
