import type { VerificationCodePurpose } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generateVerificationCode, hashVerificationCode } from './tokens';

const CODE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Creates a one-time code for the given user/purpose and returns the plaintext
 * code to send out-of-band (email, SMS, ...). Only its hash is persisted.
 * Wire this up to your email provider of choice before using in production.
 */
export async function issueVerificationCode(userId: string, purpose: VerificationCodePurpose) {
  const code = generateVerificationCode();

  await prisma.verificationCode.create({
    data: {
      userId,
      purpose,
      codeHash: hashVerificationCode(code),
      expiresAt: new Date(Date.now() + CODE_DURATION_MS),
    },
  });

  return code;
}

/** Verifies a submitted code and marks it used. Returns false if invalid/expired/already used. */
export async function consumeVerificationCode(
  userId: string,
  purpose: VerificationCodePurpose,
  code: string,
) {
  const record = await prisma.verificationCode.findFirst({
    where: {
      userId,
      purpose,
      codeHash: hashVerificationCode(code),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return false;

  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });
  return true;
}
