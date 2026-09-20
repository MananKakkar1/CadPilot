import { AgentStepStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/projects';

export async function POST(request: Request, { params }: { params: Promise<{ runId: string; subagentId: string }> }) {
  const user = await requireUser();
  const { runId, subagentId } = await params;
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
  if (!message) return NextResponse.json({ error: 'A follow-up message is required.' }, { status: 400 });
  const subagent = await prisma.agentSubagent.findFirst({ where: { id: subagentId, runId, run: { project: { ownerId: user.id } } } });
  if (!subagent) return NextResponse.json({ error: 'Subagent not found.' }, { status: 404 });
  if (([AgentStepStatus.CANCELLED, AgentStepStatus.FAILED] as AgentStepStatus[]).includes(subagent.status)) return NextResponse.json({ error: 'This subagent is not available for follow-up.' }, { status: 409 });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.agentSubagent.update({ where: { id: subagent.id }, data: { summary: `Follow-up: ${message}`, status: subagent.status === AgentStepStatus.COMPLETED ? AgentStepStatus.COMPLETED : AgentStepStatus.RUNNING } });
    const lastEvent = await tx.agentEvent.aggregate({ where: { runId }, _max: { sequence: true } });
    await tx.agentEvent.create({ data: { runId, sequence: (lastEvent._max.sequence ?? 0) + 1, type: 'subagent.follow_up', summary: `Follow-up sent to ${subagent.role}.`, payload: { subagentId, message } } });
    return result;
  });
  return NextResponse.json({ subagent: updated });
}
