import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/projects';

export async function GET() {
  try { const user = await requireUser(); const profile = await prisma.profile.findUnique({ where: { userId: user.id } }); return NextResponse.json({ profile, username: user.username }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Authentication required.' }, { status: 401 }); }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser(); const body = await request.json().catch(() => ({}));
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 80) : null;
    const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 280) : null;
    const avatarUrl = typeof body.avatarUrl === 'string' && /^https:\/\//.test(body.avatarUrl) ? body.avatarUrl.slice(0, 2_000) : null;
    const profile = await prisma.profile.upsert({ where: { userId: user.id }, update: { displayName, bio, avatarUrl }, create: { userId: user.id, displayName, bio, avatarUrl } });
    return NextResponse.json({ profile });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update profile.' }, { status: 400 }); }
}
