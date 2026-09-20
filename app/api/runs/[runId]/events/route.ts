import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/projects';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  const { runId } = await params;
  const run = await prisma.agentRun.findFirst({ where: { id: runId, project: { ownerId: user.id } }, select: { id: true } });
  if (!run) return new Response('Not found', { status: 404 });

  const cursorParam = new URL(request.url).searchParams.get('after');
  let cursor = Number.isFinite(Number(cursorParam)) ? Number(cursorParam) : 0;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let interval: ReturnType<typeof setInterval> | undefined;
      const send = async () => {
        const events = await prisma.agentEvent.findMany({ where: { runId, sequence: { gt: cursor } }, orderBy: { sequence: 'asc' } });
        for (const event of events) {
          cursor = event.sequence;
          controller.enqueue(encoder.encode(`id: ${event.sequence}\nevent: agent\ndata: ${JSON.stringify(event)}\n\n`));
        }
        const current = await prisma.agentRun.findUnique({ where: { id: runId }, select: { status: true, error: true } });
        if (current && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(current.status)) {
          controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify(current)}\n\n`));
          controller.close();
          if (interval) clearInterval(interval);
          return true;
        }
        return false;
      };
      if (await send()) return;
      interval = setInterval(() => { send().catch(() => undefined); }, 700);
    },
    cancel() { /* EventSource closed by the client. */ },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}
