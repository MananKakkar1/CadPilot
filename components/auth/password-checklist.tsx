'use client';

import { Check, X } from 'lucide-react';
import { PASSWORD_REQUIREMENTS } from '@/lib/auth/password-policy';

/**
 * Live checklist shown while typing a new password, so requirements are visible up front
 * instead of only surfacing as an error after a failed submit. Reads the same
 * `PASSWORD_REQUIREMENTS` the server actually enforces — never a stricter or looser list.
 */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="password-checklist" aria-label="Password requirements">
      {PASSWORD_REQUIREMENTS.map((requirement) => {
        const met = requirement.test(password);
        return (
          <li key={requirement.id} data-met={met}>
            {met ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
            <span>{requirement.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
