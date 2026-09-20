import { AgentStepStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/projects';

export async function POST(_: Request, { params }: { params: Promise<{ runId: string; subagentId: string }> }) {
  const user = await requireUser();
  const { runId, subagentId } = await params;
  const subagent = await prisma.agentSubagent.findFirst({ where: { id: subagentId, runId, run: { project: { ownerId: user.id } } } });
  if (!subagent) return NextResponse.json({ error: 'Subagent not found.' }, { status: 404 });
  if (([AgentStepStatus.COMPLETED, AgentStepStatus.FAILED, AgentStepStatus.CANCELLED] as AgentStepStatus[]).includes(subagent.status)) return NextResponse.json({ error: 'Subagent is already finished.' }, { status: 409 });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.agentSubagent.update({ where: { id: subagent.id }, data: { status: AgentStepStatus.CANCELLED, summary: 'Cancelled by the user.' } });
    const lastEvent = await tx.agentEvent.aggregate({ where: { runId }, _max: { sequence: true } });
    await tx.agentEvent.create({ data: { runId, sequence: (lastEvent._max.sequence ?? 0) + 1, type: 'subagent.status_changed', summary: `${subagent.role} cancelled by the user.`, payload: { subagentId, status: 'CANCELLED' } } });
    return result;
  });
  return NextResponse.json({ subagent: updated });
}
