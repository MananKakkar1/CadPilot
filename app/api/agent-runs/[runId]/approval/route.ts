import { AgentRunStatus, AgentStepStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/projects';

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const user = await requireUser();
    const { runId } = await params;
    const body = await request.json().catch(() => ({}));
    const decision = body.decision === 'approve' ? 'approve' : body.decision === 'reject' ? 'reject' : null;
    if (!decision) return NextResponse.json({ error: 'Decision must be approve or reject.' }, { status: 400 });
    const run = await prisma.agentRun.findFirst({ where: { id: runId, project: { ownerId: user.id } }, include: { approvals: { where: { status: 'PENDING' }, take: 1 }, steps: { orderBy: { sequence: 'asc' }, take: 1 } } });
    if (!run) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
    const approval = run.approvals[0];
    if (!approval) return NextResponse.json({ error: 'No pending approval exists.' }, { status: 409 });
    if (decision === 'reject') {
      const rejected = await prisma.$transaction(async (tx) => {
        await tx.approvalRequest.update({ where: { id: approval.id }, data: { status: 'REJECTED', decidedAt: new Date() } });
        await tx.agentRun.update({ where: { id: run.id }, data: { status: AgentRunStatus.CANCELLED, steps: { updateMany: { where: { id: run.steps[0]?.id }, data: { status: AgentStepStatus.CANCELLED, finishedAt: new Date() } } } } });
        return tx.agentRun.findUnique({ where: { id: run.id }, include: { approvals: true, steps: true } });
      });
      return NextResponse.json({ run: rejected });
    }
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.buildJob.create({ data: { projectId: run.projectId, prompt: run.prompt } });
      await tx.approvalRequest.update({ where: { id: approval.id }, data: { status: 'APPROVED', decidedAt: new Date() } });
      await tx.agentRun.update({ where: { id: run.id }, data: { buildJobId: job.id, status: AgentRunStatus.QUEUED, steps: { updateMany: { where: { id: run.steps[0]?.id }, data: { status: AgentStepStatus.PENDING } } } } });
      await tx.buildEvent.create({ data: { jobId: job.id, sequence: 1, stage: 'queued', agent: 'orchestrator', summary: 'Approved build queued for the isolated CAD worker.' } });
      return { job };
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update approval.' }, { status: 400 });
  }
}
