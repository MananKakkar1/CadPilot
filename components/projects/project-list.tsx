'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Box } from 'lucide-react';
import { Input } from '@/components/magicui/input';

export type ProjectRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  visibility: string;
  updatedAt: string;
  revisionCount: number;
  hasValidRevision: boolean;
  hasPendingRevision: boolean;
};

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function statusLabel(row: ProjectRow): string {
  if (row.revisionCount === 0) return 'No revisions yet';
  const noun = `${row.revisionCount} revision${row.revisionCount === 1 ? '' : 's'}`;
  if (row.hasValidRevision) return `${noun} · validated geometry available`;
  if (row.hasPendingRevision) return `${noun} · awaiting validation`;
  return `${noun} · no valid revision yet`;
}

export function ProjectList({ projects }: { projects: ProjectRow[] }) {
  const [query, setQuery] = useState('');
  const showSearch = projects.length > 0;
  const filtered = useMemo(() => {
    if (!showSearch || !query.trim()) return projects;
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => project.title.toLowerCase().includes(needle));
  }, [projects, query, showSearch]);

  return (
    <>
      {showSearch && (
        <div className="project-search">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects by title…"
            aria-label="Search projects by title"
          />
        </div>
      )}
      {filtered.length === 0 && showSearch ? (
        <p className="project-search-empty">No projects match &ldquo;{query}&rdquo;.</p>
      ) : (
        filtered.map((project) => (
          <Link href={`/projects/${project.slug}`} className="project-row" key={project.id}>
            <div className="project-row-thumb" aria-hidden="true">
              <Box size={25} strokeWidth={1.4} />
            </div>
            <div className="project-row-body">
              <strong>{project.title}</strong>
              <span>{project.summary ?? 'No description yet'}</span>
            </div>
            <div className="project-row-meta">
              <span>{statusLabel(project)}</span>
              <span>{project.visibility.toLowerCase()}</span>
              <span>Updated {relativeTime(project.updatedAt)}</span>
            </div>
          </Link>
        ))
      )}
    </>
  );
}
