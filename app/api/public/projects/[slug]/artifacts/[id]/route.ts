import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '@/lib/prisma';

// Publication is revocable; every request must recheck the current project state.
export const dynamic = 'force-dynamic';
const cacheHeaders = { 'Cache-Control': 'private, no-store' };

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const project = await prisma.project.findFirst({ where: { slug, visibility: 'PUBLIC' }, select: { publishedRevisionId: true } });
  if (!project?.publishedRevisionId) return new Response('Not found.', { status: 404, headers: cacheHeaders });
  const artifact = await prisma.artifact.findFirst({
    where: { id, revisionId: project.publishedRevisionId, revision: { isValid: true } },
    select: { filename: true, mimeType: true, storageKey: true },
  });
  if (!artifact) return new Response('Not found.', { status: 404, headers: cacheHeaders });
  try {
    const content = await readFile(join(process.env.CAD_ARTIFACT_DIR || '.cad-artifacts', artifact.storageKey));
    const inline = new URL(request.url).searchParams.get('inline') === '1';
    return new Response(content, { headers: { ...cacheHeaders, 'Content-Type': artifact.mimeType, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${artifact.filename.replaceAll('"', '')}"` } });
  } catch {
    return new Response('Artifact unavailable.', { status: 503, headers: cacheHeaders });
  }
}
