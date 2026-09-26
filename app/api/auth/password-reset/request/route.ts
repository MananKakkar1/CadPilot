import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { issueVerificationCode } from '@/lib/auth/codes';
import { sendPasswordResetEmail } from '@/lib/auth/mailer';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const code = await issueVerificationCode(user.id, 'PASSWORD_RESET');
      await sendPasswordResetEmail(email, code);
    }
  }

  // Always respond the same way, whether or not the email is registered,
  // so this endpoint can't be used to enumerate accounts.
  return NextResponse.json({ ok: true });
}
