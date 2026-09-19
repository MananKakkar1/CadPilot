import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createProjectSlug, requireUser } from '@/lib/projects';

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await prisma.project.findMany({ where: { ownerId: user.id }, include: { _count: { select: { revisions: true, jobs: true } }, jobs: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { updatedAt: 'desc' } });
    return NextResponse.json({ projects });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load projects.' }, { status: 401 }); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    if (!title) return NextResponse.json({ error: 'A project title is required.' }, { status: 400 });
    const project = await prisma.project.create({ data: { ownerId: user.id, title, slug: createProjectSlug(title), summary: typeof body.summary === 'string' ? body.summary.slice(0, 500) : null, conversations: { create: {} } } });
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create project.' }, { status: 401 }); }
}
