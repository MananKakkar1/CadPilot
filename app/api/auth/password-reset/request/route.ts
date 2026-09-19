import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { issueVerificationCode } from '@/lib/auth/codes';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const code = await issueVerificationCode(user.id, 'PASSWORD_RESET');
      // TODO: send `code` to the user's email via your provider of choice.
      // Logged here only so the flow is testable before an email provider is wired up.
      console.info(`[password-reset] code for ${email}: ${code}`);
    }
  }

  // Always respond the same way, whether or not the email is registered,
  // so this endpoint can't be used to enumerate accounts.
  return NextResponse.json({ ok: true });
}
