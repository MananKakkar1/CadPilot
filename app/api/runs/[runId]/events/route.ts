import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/projects';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  const { runId } = await params;
  const run = await prisma.agentRun.findFirst({ where: { id: runId, project: { ownerId: user.id } }, select: { id: true } });
  if (!run) return new Response('Not found', { status: 404 });

  const cursorParam = request.headers.get('last-event-id') ?? new URL(request.url).searchParams.get('after');
  let cursor = Number.isSafeInteger(Number(cursorParam)) && Number(cursorParam) >= 0 ? Number(cursorParam) : 0;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let abort: () => void = () => undefined;
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
  };
  const stream = new ReadableStream({
    start(controller) {
      abort = () => { if (!stopped) { stop(); controller.close(); } };
      request.signal.addEventListener('abort', abort, { once: true });
      if (request.signal.aborted) { abort(); return; }
      const send = async () => {
        if (stopped) return;
        try {
        const events = await prisma.agentEvent.findMany({ where: { runId, sequence: { gt: cursor } }, orderBy: { sequence: 'asc' } });
        if (stopped) return;
        for (const event of events) {
          cursor = event.sequence;
          controller.enqueue(encoder.encode(`id: ${event.sequence}\nevent: agent\ndata: ${JSON.stringify(event)}\n\n`));
        }
        const current = await prisma.agentRun.findUnique({ where: { id: runId }, select: { status: true, error: true } });
        if (stopped) return;
        if (!current) { stop(); controller.close(); return; }
        if (current && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(current.status)) {
          controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify(current)}\n\n`));
          stop();
          controller.close();
          return;
        }
        timer = setTimeout(() => { void send(); }, 700);
        } catch (error) {
          if (!stopped) { stop(); controller.error(error); }
        }
      };
      void send();
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}
