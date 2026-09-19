import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth/password';
import { consumeVerificationCode } from '@/lib/auth/codes';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

  if (!email || !code || newPassword.length < 8) {
    return NextResponse.json(
      { error: 'Email, code, and a new password (min 8 characters) are required' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await consumeVerificationCode(user.id, 'PASSWORD_RESET', code) : false;

  if (!user || !valid) {
    return NextResponse.json({ error: 'Invalid or expired code' }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    // Resetting the password invalidates every existing session on the account.
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
