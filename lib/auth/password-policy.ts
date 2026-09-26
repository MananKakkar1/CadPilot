// Single source of truth for password requirements, shared between the server-side signup
// and password-reset routes (the actual enforcement) and the client-side checklist (the UI
// that shows the same requirements live, so what's displayed always matches what's accepted).
export type PasswordRequirement = { id: string; label: string; test: (password: string) => boolean };

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { id: 'length', label: 'At least 8 characters', test: (password) => password.length >= 8 },
  { id: 'letter', label: 'Contains a letter', test: (password) => /[a-zA-Z]/.test(password) },
  { id: 'number', label: 'Contains a number', test: (password) => /[0-9]/.test(password) },
];

export function passwordFailures(password: string): string[] {
  return PASSWORD_REQUIREMENTS.filter((requirement) => !requirement.test(password)).map((requirement) => requirement.label);
}

export function isPasswordValid(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password));
}
