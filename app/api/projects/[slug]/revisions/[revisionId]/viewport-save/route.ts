import { POST as saveChiliRevision } from '@/app/api/projects/[slug]/chili-import/route';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; revisionId: string }> }) {
  const { slug, revisionId } = await params;
  const body = await request.json().catch(() => ({}));
  const forwarded = new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, parentRevisionId: revisionId }),
  });
  return saveChiliRevision(forwarded, { params: Promise.resolve({ slug }) });
}
