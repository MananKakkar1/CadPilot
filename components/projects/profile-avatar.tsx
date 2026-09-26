'use client';

import { useState } from 'react';

function initialsFor(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ProfileAvatar({ avatarUrl, label }: { avatarUrl?: string | null; label: string }) {
  const [errored, setErrored] = useState(false);

  if (avatarUrl && !errored) {
    return (
      <img
        src={avatarUrl}
        alt={`${label} avatar`}
        className="profile-avatar"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div className="profile-avatar profile-avatar-fallback" aria-hidden="true">
      {initialsFor(label)}
    </div>
  );
}
