import { AgentRunStatus, AgentStepStatus, AgentStepType } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parsePrompt } from '@/lib/cad/contracts';
import { requireProjectOwner } from '@/lib/projects';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { project } = await requireProjectOwner(slug);
    const body = await request.json().catch(() => ({}));
    const prompt = parsePrompt(body.prompt);
    const mode = body.mode === 'plan' ? 'plan' : 'execute';
    const run = await prisma.agentRun.create({
      data: {
        projectId: project.id,
        prompt,
        mode,
        status: mode === 'plan' ? AgentRunStatus.AWAITING_APPROVAL : AgentRunStatus.QUEUED,
        steps: { create: { sequence: 1, type: AgentStepType.PLAN, status: mode === 'plan' ? AgentStepStatus.AWAITING_APPROVAL : AgentStepStatus.PENDING, title: 'Prepare an editable CAD build', summary: mode === 'plan' ? 'Review the proposed build before execution.' : null } },
        approvals: mode === 'plan' ? { create: { action: 'Create a new CAD revision', risk: 'writes project files and creates a revision', explanation: 'The agent will generate Replicad source, validate the solid, and attach CAD artifacts to this project.' } } : undefined,
      },
      include: { steps: true, approvals: true },
    });
    await prisma.agentEvent.create({ data: { runId: run.id, sequence: 1, type: 'run.created', summary: mode === 'plan' ? 'Plan created and waiting for approval.' : 'Agent run queued.', payload: { mode } } });
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create agent run.' }, { status: 400 });
  }
}
