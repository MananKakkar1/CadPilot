import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getCurrentUser(); const { jobId } = await params;
  const job = user ? await prisma.buildJob.findFirst({ where: { id: jobId, project: { ownerId: user.id } } }) : null;
  if (!job) return new Response('Not found', { status: 404 });
  const encoder = new TextEncoder(); let cursor = 0;
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        const events = await prisma.buildEvent.findMany({ where: { jobId, sequence: { gt: cursor } }, orderBy: { sequence: 'asc' } });
        for (const event of events) { cursor = event.sequence; controller.enqueue(encoder.encode(`event: build\ndata: ${JSON.stringify(event)}\n\n`)); }
        const fresh = await prisma.buildJob.findUnique({ where: { id: jobId } });
        if (fresh && ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(fresh.status)) { controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify({ status: fresh.status, revisionId: fresh.revisionId, error: fresh.error })}\n\n`)); controller.close(); return true; }
        return false;
      };
      if (await send()) return;
      const interval = setInterval(async () => { if (await send()) clearInterval(interval); }, 850);
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}
