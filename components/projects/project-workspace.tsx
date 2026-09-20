'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, FileCode2, Hammer, Send, Wrench } from 'lucide-react';
import { Button } from '@/components/magicui/button';
import { Marker, MarkerContent, MarkerIcon } from '@/components/magicui/marker';
import { MagicCard } from '@/components/magicui/magic-card';
import { ScrollArea } from '@/components/magicui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/magicui/accordion';
import { EngineeringMarkdown } from '@/components/projects/engineering-markdown';
import { ProjectCadViewport } from '@/components/projects/project-cad-viewport';
import { HANDOFF_TO_CHILI_NAME, HANDOFF_TO_CHILI_STEP } from '@/components/cad/cad-handoff';

type Event = { id: string; stage: string; agent: string; tool?: string | null; summary: string; detail?: Record<string, unknown> | null; createdAt: string };
type Project = { slug: string; title: string; visibility: string; revisions: Array<{ id: string; revisionNumber: number; isValid: boolean; metrics: { volume?: number; surfaceArea?: number } | null; artifacts: Array<{ id: string; filename: string; kind: string }> }>; jobs: Array<{ id: string; status: string; events: Event[] }>; conversations: Array<{ messages: Array<{ id: string; role: string; content: string; createdAt: string }> }> };

const iconFor = (stage: string) => stage === 'evaluate' ? CheckCircle2 : stage === 'generate' ? FileCode2 : stage === 'repair' ? Wrench : Hammer;

export function ProjectWorkspace({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState(initialProject); const [prompt, setPrompt] = useState(''); const [events, setEvents] = useState<Event[]>(initialProject.jobs[0]?.events ?? []); const [busy, setBusy] = useState(false); const [openingChili, setOpeningChili] = useState(false);
  const revision = project.revisions[0]; const messages = project.conversations[0]?.messages ?? [];
  const feed = useMemo(() => events.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [events]);
  useEffect(() => { if (!busy || !project.jobs[0]) return; const stream = new EventSource(`/api/builds/${project.jobs[0].id}/events`); stream.addEventListener('build', (message) => { const next = JSON.parse((message as MessageEvent).data) as Event; setEvents((current) => current.some((item) => item.id === next.id) ? current : [...current, next]); }); stream.addEventListener('complete', () => { stream.close(); setBusy(false); location.reload(); }); return () => stream.close(); }, [busy, project.jobs]);
  const build = async () => { if (!prompt.trim()) return; setBusy(true); const response = await fetch(`/api/projects/${project.slug}/builds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, parentRevisionId: revision?.id }) }); const data = await response.json(); if (!response.ok) { setBusy(false); return; } setProject((current) => ({ ...current, jobs: [{ ...data.job, events: [] }, ...current.jobs] })); setEvents([]); setPrompt(''); };
  const publish = async () => { if (!revision) return; await fetch(`/api/projects/${project.slug}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisionId: revision.id }) }); setProject((current) => ({ ...current, visibility: 'PUBLIC' })); };
  const stepArtifact = revision?.artifacts.find((file) => file.kind === 'STEP');
  const previewArtifact = revision?.artifacts.find((file) => file.kind === 'PREVIEW_MESH');
  const editInChiliCad = async () => {
    if (!revision || !stepArtifact || openingChili) return;
    setOpeningChili(true);
    try {
      const response = await fetch(`/api/artifacts/${stepArtifact.id}`);
      if (!response.ok) throw new Error('Could not load this revision\'s STEP file.');
      const step = await response.text();
      window.localStorage.setItem(HANDOFF_TO_CHILI_STEP, step);
      window.localStorage.setItem(HANDOFF_TO_CHILI_NAME, project.title);
      window.location.href = `/chili-editor?project=${project.slug}&revision=${revision.id}`;
    } catch {
      setOpeningChili(false);
    }
  };
  return <main className="agent-workspace"><header className="agent-topbar"><a href="/projects">Projects</a><div><strong>{project.title}</strong><span>{project.visibility === 'PUBLIC' ? 'Published' : 'Private draft'}</span></div><div className="agent-topbar-actions"><Button variant="outline" onClick={editInChiliCad} disabled={!stepArtifact || openingChili}>{openingChili ? 'Opening…' : 'Edit in ChiliCAD'}</Button><Button variant="outline" onClick={publish} disabled={!revision?.isValid || project.visibility === 'PUBLIC'}>Publish revision</Button></div></header><div className="agent-grid"><section className="agent-chat"><ScrollArea className="agent-scroll"><div className="agent-chat-inner">{messages.map((message) => <article className={`agent-message agent-message-${message.role}`} key={message.id}><span>{message.role === 'user' ? 'You' : 'Agentic CAD'}</span><EngineeringMarkdown>{message.content}</EngineeringMarkdown></article>)}{busy && <article className="agent-message agent-message-assistant"><span>Agentic CAD</span><EngineeringMarkdown>Building an editable BREP on the server…</EngineeringMarkdown></article>}</div></ScrollArea><div className="agent-composer"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a part or refine this project…" /><Button onClick={build} disabled={busy || !prompt.trim()} aria-label="Send design request"><Send /> <span>{busy ? 'Building' : 'Build revision'}</span></Button></div></section><section className="agent-preview"><ProjectCadViewport artifactId={previewArtifact?.id} revisionNumber={revision?.revisionNumber} /><MagicCard className="agent-preview-card" gradientFrom="#4f46e5" gradientTo="#06b6d4"><p>Validated CAD metrics</p><h1>{revision ? `Revision ${revision.revisionNumber}` : 'Start your first revision'}</h1>{revision?.metrics && <dl><div><dt>Volume</dt><dd>{revision.metrics.volume?.toLocaleString()} mm³</dd></div><div><dt>Surface</dt><dd>{revision.metrics.surfaceArea?.toLocaleString()} mm²</dd></div></dl>}</MagicCard><Accordion type="single" collapsible className="agent-files"><AccordionItem value="files"><AccordionTrigger>Project files</AccordionTrigger><AccordionContent>{revision?.artifacts.length ? revision.artifacts.map((file) => <a href={`/api/artifacts/${file.id}`} key={file.id}><FileCode2 /> {file.filename}</a>) : <p>Validated revisions add code, mesh, STEP, STL, and audit files here.</p>}</AccordionContent></AccordionItem></Accordion></section><aside className="agent-rail"><Marker variant="separator"><MarkerContent>Agent activity</MarkerContent></Marker><ScrollArea className="agent-scroll"><div className="agent-events">{feed.length ? feed.map((item) => { const Icon = iconFor(item.stage); return <Marker key={item.id} variant="border"><MarkerIcon><Icon /></MarkerIcon><MarkerContent><strong>{item.agent}</strong><span>{item.tool ?? item.stage}</span><p>{item.summary}</p></MarkerContent></Marker>; }) : <Marker><MarkerIcon><Bot /></MarkerIcon><MarkerContent><strong>Orchestrator</strong><p>Submit a design brief to begin the agent pipeline.</p></MarkerContent></Marker>}</div></ScrollArea></aside></div></main>;
}
