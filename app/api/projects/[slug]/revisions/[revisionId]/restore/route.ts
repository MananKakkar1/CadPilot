import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queueBuild } from '@/lib/cad/queue-build';
import { notifyCadWorker } from '@/lib/cad/worker-socket';
import { MAX_LABEL_LENGTH, RevisionRouteError, requireOwnedRevision, revisionErrorResponse } from '@/lib/revisions';

export const runtime = 'nodejs';

/**
 * Non-destructive restore. Nothing existing is touched: the target revision, the published revision
 * and every other revision keep their rows. A NEW revision is appended carrying the target's
 * source/intent/plan, with `parentId` pointing at the target so lineage records where it came from.
 *
 * It lands as source-only (`isValid: false`, no metrics/validation/artifacts) because this route
 * never claims geometry it has not measured — the CAD worker is what produces artifacts, and it
 * regenerates code from a prompt rather than re-executing a supplied source, so it cannot be used
 * to faithfully re-derive this snapshot. Pass `{ "rebuild": true }` to additionally queue a real
 * build off the target through the same transactional path as POST /builds; that build yields its
 * own generated revision alongside the restored snapshot.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string; revisionId: string }> }) {
  try {
    const { slug, revisionId } = await params;
    const { project, revision: source } = await requireOwnedRevision(slug, revisionId);
    const body = await request.json().catch(() => ({}));
    const rebuild = body?.rebuild === true;
    if (rebuild && !source.isValid) throw new RevisionRouteError('Only a validated revision can seed a rebuild. Restore it as source first.', 400);
    const note = `Restore of R${source.revisionNumber}${source.label ? ` — ${source.label}` : ''}`;

    const result = await prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: project.id }, data: { updatedAt: new Date() } });
      const last = await tx.revision.aggregate({ where: { projectId: project.id }, _max: { revisionNumber: true } });
      const restored = await tx.revision.create({ data: {
        projectId: project.id,
        revisionNumber: (last._max.revisionNumber ?? 0) + 1,
        parentId: source.id,
        label: note.slice(0, MAX_LABEL_LENGTH),
        prompt: note,
        intent: source.intent ?? {},
        plan: source.plan ?? {},
        sourceCode: source.sourceCode,
        isValid: false,
      } });
      await tx.chatMessage.create({ data: { conversation: { connectOrCreate: { where: { projectId: project.id }, create: { projectId: project.id } } }, role: 'assistant', content: `## Revision ${restored.revisionNumber} — restored from R${source.revisionNumber}\n\nThe source, intent and plan of R${source.revisionNumber} were copied into a new revision. R${source.revisionNumber} and every other revision are unchanged. This restored revision has no geometry of its own yet${rebuild ? '; a rebuild has been queued.' : '; build it to regenerate artifacts.'}`, revisionId: restored.id } });
      const queued = rebuild ? await queueBuild(tx, { projectId: project.id, prompt: source.prompt, parentId: source.id, title: `Rebuild of R${source.revisionNumber}`, stepTitle: `Rebuild the geometry of R${source.revisionNumber}`, userMessage: null, queuedSummary: `Rebuild of R${source.revisionNumber} queued for the isolated CAD worker.`, runSummary: `Rebuild of R${source.revisionNumber} queued for the isolated worker.` }) : null;
      return { restored, queued };
    });

    const workerConnected = result.queued ? await notifyCadWorker(result.queued.job.id) : null;
    return NextResponse.json({
      revision: result.restored,
      restoredFrom: { id: source.id, revisionNumber: source.revisionNumber, label: source.label },
      rebuild: result.queued ? { queued: true, job: result.queued.job, run: result.queued.run, workerConnected } : { queued: false, reason: 'Pass { "rebuild": true } to queue a build, or start one from the workspace.' },
    }, { status: 201 });
  } catch (error) { return revisionErrorResponse(error, 'Unable to restore this revision.'); }
}
