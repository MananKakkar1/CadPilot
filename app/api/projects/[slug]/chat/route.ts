import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireProjectOwner } from '@/lib/projects';
import { chatAboutProject } from '@/lib/cad/gemini-chat.mjs';

export const runtime = 'nodejs';

const MAX_MESSAGE_CHARS = 4000;
// The model only needs recent turns for continuity; the context block carries the design facts.
const HISTORY_LIMIT = 24;

/**
 * Ask a question about the project. This is the conversational counterpart to /builds and /runs:
 * it never queues a job, never creates a revision, and never mutates geometry.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const { project } = await requireProjectOwner(slug);
    const body = await request.json().catch(() => null);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) return NextResponse.json({ error: 'A message is required.' }, { status: 400 });
    if (message.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: `Keep questions under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'The assistant is unavailable: no GEMINI_API_KEY is configured on the server.' }, { status: 503 });

    const requestedRevisionId = typeof body?.revisionId === 'string' ? body.revisionId : null;
    const revision = await prisma.revision.findFirst({
      where: { projectId: project.id, archivedAt: null, ...(requestedRevisionId ? { id: requestedRevisionId } : { isValid: true }) },
      include: { artifacts: { select: { kind: true } } },
      orderBy: { revisionNumber: 'desc' },
    });

    const conversation = await prisma.conversation.upsert({
      where: { projectId: project.id },
      update: {},
      create: { projectId: project.id },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: HISTORY_LIMIT } },
    });

    const result = await chatAboutProject({
      message,
      history: conversation.messages.map((item) => ({ role: item.role, content: item.content })),
      context: revision
        ? {
            revisionNumber: revision.revisionNumber,
            prompt: revision.prompt,
            isValid: revision.isValid,
            metrics: revision.metrics as Record<string, unknown> | null,
            validation: revision.validation as Record<string, unknown> | null,
            sourceCode: revision.sourceCode,
            artifactKinds: revision.artifacts.map((item) => item.kind),
          }
        : {},
      apiKey,
    });

    // Persist the exchange together so a failed write can never leave a half-recorded conversation.
    // Both rows would otherwise take the same default now(), leaving the transcript order (sorted
    // by createdAt) undefined, so the timestamps are set explicitly one millisecond apart.
    const askedAt = new Date();
    const answeredAt = new Date(askedAt.getTime() + 1);
    const [userMessage, assistantMessage] = await prisma.$transaction([
      prisma.chatMessage.create({ data: { conversationId: conversation.id, role: 'user', content: message, revisionId: revision?.id ?? null, createdAt: askedAt } }),
      prisma.chatMessage.create({ data: { conversationId: conversation.id, role: 'assistant', content: result.reply, revisionId: revision?.id ?? null, createdAt: answeredAt } }),
    ]);

    return NextResponse.json({
      reply: result.reply,
      // Reasoning is returned for display but deliberately not persisted as a chat message.
      thoughts: result.thoughts || null,
      model: result.model,
      messages: [userMessage, assistantMessage],
      revisionId: revision?.id ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to answer right now.';
    if (message === 'Authentication required.') return NextResponse.json({ error: message }, { status: 401 });
    if (message === 'Project not found.') return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
