import { createHmac, randomBytes, randomInt } from 'node:crypto';

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is not set');
  }
  return secret;
}

// Only a hash of a session token / verification code is ever stored, so a
// leaked database dump alone cannot be used to log in or complete a reset.
function hmac(value: string) {
  return createHmac('sha256', authSecret()).update(value).digest('hex');
}

/** Opaque, high-entropy session token handed to the client (e.g. in a cookie). */
export function generateSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string) {
  return hmac(token);
}

/** 6-digit numeric code for email verification / password reset, sent out-of-band. */
export function generateVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashVerificationCode(code: string) {
  return hmac(code);
}
