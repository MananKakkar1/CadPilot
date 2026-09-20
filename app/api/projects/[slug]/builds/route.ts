import { NextResponse } from 'next/server';
import { AgentRunStatus, AgentStepStatus, AgentStepType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { parsePrompt } from '@/lib/cad/contracts';
import { requireProjectOwner } from '@/lib/projects';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { project } = await requireProjectOwner(slug);
    const body = await request.json().catch(() => ({}));
    const prompt = parsePrompt(body.prompt);
    const parentId = typeof body.parentRevisionId === 'string' ? body.parentRevisionId : null;
    if (parentId && !await prisma.revision.findFirst({ where: { id: parentId, projectId: project.id } })) return NextResponse.json({ error: 'Invalid parent revision.' }, { status: 400 });
    const { job } = await prisma.$transaction(async (tx) => {
      const createdJob = await tx.buildJob.create({ data: { projectId: project.id, prompt, parentId } });
      await tx.agentRun.create({ data: { projectId: project.id, buildJobId: createdJob.id, prompt, mode: 'execute', status: AgentRunStatus.QUEUED, steps: { create: { sequence: 1, type: AgentStepType.PLAN, status: AgentStepStatus.PENDING, title: 'Prepare an editable CAD build' } } } });
      await tx.chatMessage.create({ data: { conversation: { connectOrCreate: { where: { projectId: project.id }, create: { projectId: project.id } } }, role: 'user', content: prompt } });
      return { job: createdJob };
    });
    await prisma.buildEvent.create({ data: { jobId: job.id, sequence: 1, stage: 'queued', agent: 'orchestrator', summary: 'Build queued for the isolated CAD worker.' } });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create build.' }, { status: 400 }); }
}
