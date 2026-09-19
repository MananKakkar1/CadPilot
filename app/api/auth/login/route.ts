import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, setSessionCookie } from '@/lib/auth/session';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !passwordMatches) {
    // Same message either way so login can't be used to enumerate registered emails.
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const { token, expiresAt } = await createSession(user.id, {
    userAgent: request.headers.get('user-agent'),
    ipAddress: request.headers.get('x-forwarded-for'),
  });
  await setSessionCookie(token, expiresAt);

  return NextResponse.json({ id: user.id, email: user.email, username: user.username });
}
