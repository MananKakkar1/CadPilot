// Single source of truth for email/username format rules, shared between the signup route
// (actual enforcement) and the signup form (live client-side feedback), so a rejected field
// is always visible and explained up front instead of only surfacing as an opaque 400 after
// submit.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export const USERNAME_HINT = '3-20 characters: letters, numbers, and underscore only (no spaces, hyphens, or symbols)';

export function isEmailValid(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function isUsernameValid(username: string): boolean {
  return USERNAME_RE.test(username.trim());
}
