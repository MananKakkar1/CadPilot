import { AgentRunStatus, AgentStepStatus, AgentStepType, type Prisma } from '@prisma/client';

export type QueueBuildInput = {
  projectId: string;
  prompt: string;
  parentId?: string | null;
  title?: string;
  stepTitle?: string;
  /** Conversation entry for the request. `null` queues the build without touching the chat log. */
  userMessage?: string | null;
  queuedSummary?: string;
  runSummary?: string;
};

/**
 * Commits the whole queued-build unit — job, agent run, its first step, the chat entry and both
 * event streams — so a build is never half-visible. Call inside a `prisma.$transaction`; the caller
 * wakes the worker with `notifyCadWorker(job.id)` only after that transaction commits.
 */
export async function queueBuild(tx: Prisma.TransactionClient, input: QueueBuildInput) {
  const { projectId, prompt, parentId = null, title = 'CAD build', stepTitle = 'Prepare an editable CAD build', userMessage = prompt, queuedSummary = 'Build queued for the isolated CAD worker.', runSummary = 'CAD build queued for the isolated worker.' } = input;
  const job = await tx.buildJob.create({ data: { projectId, prompt, parentId } });
  const run = await tx.agentRun.create({ data: { projectId, buildJobId: job.id, prompt, mode: 'execute', status: AgentRunStatus.QUEUED, title, steps: { create: { sequence: 1, type: AgentStepType.PLAN, status: AgentStepStatus.PENDING, title: stepTitle } } } });
  if (userMessage !== null) await tx.chatMessage.create({ data: { conversation: { connectOrCreate: { where: { projectId }, create: { projectId } } }, role: 'user', content: userMessage } });
  await tx.buildEvent.create({ data: { jobId: job.id, sequence: 1, stage: 'queued', agent: 'orchestrator', summary: queuedSummary } });
  await tx.agentEvent.create({ data: { runId: run.id, sequence: 1, type: 'run.created', summary: runSummary, payload: { jobId: job.id } } });
  return { job, run };
}
