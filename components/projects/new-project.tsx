'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/magicui/button';
import { MagicCard } from '@/components/magicui/magic-card';

export function NewProject() {
  const router = useRouter(); const [title, setTitle] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const create = async () => { setLoading(true); setError(''); const response = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) }); const data = await response.json(); if (!response.ok) { setError(data.error ?? 'Unable to create project.'); setLoading(false); return; } router.push(`/projects/${data.project.slug}`); };
  return <main className="new-project-page"><MagicCard className="new-project-card" gradientFrom="#4f46e5" gradientTo="#06b6d4"><p>AGENTIC CAD</p><h1>Create a design project.</h1><span>Every prompt, build, validation report, and export stays attached to this project.</span><label>Project name<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Modular desk lamp" autoFocus /></label>{error && <p className="form-error">{error}</p>}<Button onClick={create} disabled={loading || !title.trim()}>{loading ? 'Creating…' : 'Create workspace'}</Button></MagicCard></main>;
}
