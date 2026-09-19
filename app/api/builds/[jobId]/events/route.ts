import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser(); const { jobId } = await params;
  const job = user ? await prisma.buildJob.findFirst({ where: { id: jobId, project: { ownerId: user.id } } }) : null;
  if (!job) return new Response('Not found', { status: 404 });
  const encoder = new TextEncoder(); let cursor = 0; let closed = false; let running = false; let interval: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        if (closed || running) return true;
        running = true;
        try {
        const events = await prisma.buildEvent.findMany({ where: { jobId, sequence: { gt: cursor } }, orderBy: { sequence: 'asc' } });
        for (const event of events) {
          if (closed) return true;
          cursor = event.sequence;
          controller.enqueue(encoder.encode(`event: build\ndata: ${JSON.stringify(event)}\n\n`));
        }
        const fresh = await prisma.buildJob.findUnique({ where: { id: jobId } });
        if (closed) return true;
        if (fresh && ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(fresh.status)) {
          controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify({ status: fresh.status, revisionId: fresh.revisionId, error: fresh.error })}\n\n`));
          closed = true;
          controller.close();
          if (interval) clearInterval(interval);
          return true;
        }
        return false;
        } catch (error) {
          if (!closed) { closed = true; try { controller.error(error); } catch { /* client disconnected */ } }
          if (interval) clearInterval(interval);
          return true;
        } finally { running = false; }
      };
      if (await send()) return;
      interval = setInterval(async () => { await send(); }, 850);
    },
    cancel() { closed = true; if (interval) clearInterval(interval); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}
