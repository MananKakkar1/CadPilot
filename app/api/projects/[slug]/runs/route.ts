import { AgentRunStatus, AgentStepStatus, AgentStepType } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parsePrompt } from '@/lib/cad/contracts';
import { buildParametricPlan, inferDesignIntent } from '../../../../../lib/cad/intent.mjs';
import { requireProjectOwner } from '@/lib/projects';
import { POST as createBuild } from '../builds/route';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const body = await request.clone().json().catch(() => ({}));
    // Execute requests must use the same transactional queue as workspace builds.
    // Leave the original request body readable for that handler.
    if (body.mode !== 'plan') return createBuild(request, { params });
    const { slug } = await params;
    const { project } = await requireProjectOwner(slug);
    const prompt = parsePrompt(body.prompt);
    const intent = inferDesignIntent(prompt);
    const plan = buildParametricPlan(intent);
    const parentId = typeof body.parentRevisionId === 'string' ? body.parentRevisionId : null;
    if (parentId && !await prisma.revision.findFirst({ where: { id: parentId, projectId: project.id, isValid: true } })) {
      return NextResponse.json({ error: 'Choose a completed revision as the editing base.' }, { status: 400 });
    }
    const mode = body.mode === 'plan' ? 'plan' : 'execute';
    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.agentRun.create({
        data: {
          projectId: project.id,
          prompt,
          mode,
          metadata: { parentRevisionId: parentId, intent, plan },
          status: mode === 'plan' ? AgentRunStatus.AWAITING_APPROVAL : AgentRunStatus.QUEUED,
          steps: { create: { sequence: 1, type: AgentStepType.PLAN, status: mode === 'plan' ? AgentStepStatus.AWAITING_APPROVAL : AgentStepStatus.PENDING, title: 'Prepare an editable CAD build', summary: mode === 'plan' ? plan.summary : null } },
          approvals: mode === 'plan' ? { create: { action: 'Create a new CAD revision', risk: 'writes project files and creates a revision', explanation: `${plan.summary} The run will preserve ${Object.keys(intent.dimensions).length ? Object.entries(intent.dimensions).map(([key, value]) => `${key}=${value}${key === 'teeth' ? '' : ' mm'}`).join(', ') : 'the dimensions inferred from your request'} and enforce ${intent.constraints.join(', ')}.` } } : undefined,
        },
        include: { steps: true, approvals: true },
      });
      await tx.agentEvent.create({ data: { runId: created.id, sequence: 1, type: 'run.created', summary: mode === 'plan' ? 'Plan created and waiting for approval.' : 'Agent run queued.', payload: { mode } } });
      return created;
    });
    return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create agent run.' }, { status: 400 });
  }
}
