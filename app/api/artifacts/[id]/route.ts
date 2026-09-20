import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const user = await getCurrentUser();
  const artifact = user ? await prisma.artifact.findFirst({ where: { id, revision: { project: { ownerId: user.id } } } }) : null;
  if (!artifact) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  try { const content = await readFile(join(process.env.CAD_ARTIFACT_DIR || '.cad-artifacts', artifact.storageKey)); const inline = new URL(request.url).searchParams.get('inline') === '1'; return new Response(content, { headers: { 'Content-Type': artifact.mimeType, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${artifact.filename}"` } }); }
  catch { return NextResponse.json({ error: 'Artifact is unavailable from this application instance.' }, { status: 503 }); }
}
