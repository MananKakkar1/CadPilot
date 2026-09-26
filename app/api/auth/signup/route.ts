import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { isPasswordValid, passwordFailures } from '@/lib/auth/password-policy';
import { isEmailValid, isUsernameValid, USERNAME_HINT } from '@/lib/auth/signup-validation';
import { createSession, setSessionCookie } from '@/lib/auth/session';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!isEmailValid(email)) {
    return NextResponse.json({ error: 'Invalid email address', field: 'email' }, { status: 400 });
  }
  if (!isUsernameValid(username)) {
    return NextResponse.json(
      { error: `Username must be ${USERNAME_HINT}`, field: 'username' },
      { status: 400 },
    );
  }
  if (!isPasswordValid(password)) {
    return NextResponse.json(
      { error: `Password does not meet requirements: ${passwordFailures(password).join(', ')}`, field: 'password' },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await prisma.user.create({
      data: { email, username, passwordHash },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const targets = (err.meta?.target as string[] | undefined) ?? [];
      const field = targets.includes('email') ? 'email' : targets.includes('username') ? 'username' : undefined;
      return NextResponse.json(
        { error: `An account with that ${targets.join(', ') || 'email/username'} already exists`, field },
        { status: 409 },
      );
    }
    throw err;
  }

  const { token, expiresAt } = await createSession(user.id, {
    userAgent: request.headers.get('user-agent'),
    ipAddress: request.headers.get('x-forwarded-for'),
  });
  await setSessionCookie(token, expiresAt);

  return NextResponse.json(
    { id: user.id, email: user.email, username: user.username },
    { status: 201 },
  );
}
