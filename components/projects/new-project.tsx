'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/magicui/input';
import { Button } from '@/components/magicui/button';

export function NewProject() {
  const router = useRouter(); const [title, setTitle] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error ?? 'Unable to create project.'); setLoading(false); return; }
      router.push(`/projects/${data.project.slug}`);
    } catch {
      setError('Unable to reach the server. Please try again.');
      setLoading(false);
    }
  };
  return <main className="new-project-page"><section className="new-project-card"><p className="site-eyebrow">A NEW BEGINNING</p><h1>Name your next design.</h1><span>Every prompt, build, validation report, and export stays attached to this project.</span><form onSubmit={create}><label htmlFor="project-title">Project name<Input required maxLength={120} id="project-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Modular desk lamp" autoFocus /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button type="submit" disabled={loading || !title.trim()}>{loading ? 'Creating…' : 'Create workspace'}</Button></form><Button asChild variant="ghost"><Link href="/projects">Back to projects</Link></Button></section></main>;
}
