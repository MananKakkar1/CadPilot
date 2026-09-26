import nodemailer from 'nodemailer';

/**
 * Minimal mail-sending abstraction for auth flows.
 *
 * Reads SMTP config from environment variables (SMTP_HOST, SMTP_PORT,
 * SMTP_USER, SMTP_PASS, MAIL_FROM). If SMTP_HOST is not set, this falls back
 * to logging the message via console.info instead of sending real mail.
 *
 * IMPORTANT: the console.info fallback below is a LOCAL-DEV-ONLY stand-in —
 * it is not the production path. It exists only so the auth flow is testable
 * without real SMTP credentials. Set SMTP_HOST (and friends) in the
 * environment to enable real delivery.
 */

let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (cachedTransport) return cachedTransport;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  return cachedTransport;
}

export async function sendPasswordResetEmail(email: string, code: string): Promise<void> {
  const host = process.env.SMTP_HOST;

  if (!host) {
    // --- LOCAL/DEV FALLBACK — NOT the production path ---
    // No SMTP_HOST configured, so no real email provider is wired up. Log the
    // code instead so the reset flow stays testable without credentials.
    console.info(`[password-reset] (no SMTP_HOST set — dev fallback) code for ${email}: ${code}`);
    return;
  }

  const from = process.env.MAIL_FROM ?? 'no-reply@localhost';
  const transport = getTransport();

  await transport.sendMail({
    from,
    to: email,
    subject: 'Your password reset code',
    text: `Your password reset code is ${code}. It expires in 15 minutes. If you didn't request this, you can ignore this email.`,
    html: `<p>Your password reset code is <strong>${code}</strong>.</p><p>It expires in 15 minutes. If you didn't request this, you can ignore this email.</p>`,
  });
}
