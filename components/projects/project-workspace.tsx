'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bot, Box, CheckCircle2, Download, Eye, FileCode2, Hammer, Ruler, Send, Wrench } from 'lucide-react';
import { Button } from '@/components/magicui/button';
import { Dock, DockIcon } from '@/components/magicui/dock';
import { Marker, MarkerContent, MarkerIcon } from '@/components/magicui/marker';
import { ScrollArea } from '@/components/magicui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/magicui/accordion';
import { EngineeringMarkdown } from '@/components/projects/engineering-markdown';
import { ChiliEditor } from '@/components/cad/chili-editor';
import { HANDOFF_TO_CHILI_NAME } from '@/components/cad/cad-handoff';

type Event = { id: string; stage: string; agent: string; tool?: string | null; summary: string; detail?: Record<string, unknown> | null; createdAt: string };
type Artifact = { id: string; filename: string; kind: string };
type Project = { slug: string; title: string; visibility: string; revisions: Array<{ id: string; revisionNumber: number; isValid: boolean; metrics: { volume?: number; surfaceArea?: number } | null; artifacts: Artifact[] }>; jobs: Array<{ id: string; status: string; events: Event[] }>; conversations: Array<{ messages: Array<{ id: string; role: string; content: string; createdAt: string }> }>; agentRuns?: Array<{ id: string; status: string; mode: string; steps: Array<{ id: string; title: string; status: string; summary: string | null }>; subagents: Array<{ id: string; role: string; status: string; summary: string | null }>; approvals: Array<{ id: string; status: string; action: string }> }> };
type PendingRun = { id: string; approvals: Array<{ id: string; action: string; risk: string; explanation: string }> };
type StreamState = 'offline' | 'connecting' | 'live' | 'reconnecting';

const iconFor = (stage: string) => stage === 'evaluate' ? CheckCircle2 : stage === 'generate' ? FileCode2 : stage === 'repair' ? Wrench : Hammer;

export function ProjectWorkspace({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState(initialProject);
  const [prompt, setPrompt] = useState('');
  const [events, setEvents] = useState<Event[]>(initialProject.jobs[0]?.events ?? []);
  const initialJob = initialProject.jobs[0];
  const [activeJobId, setActiveJobId] = useState<string | null>(initialJob?.id ?? null);
  const [busy, setBusy] = useState(['QUEUED', 'RUNNING'].includes(initialJob?.status ?? ''));
  const [streamState, setStreamState] = useState<StreamState>(['QUEUED', 'RUNNING'].includes(initialJob?.status ?? '') ? 'connecting' : 'offline');
  const [planMode, setPlanMode] = useState(false);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const [showChili, setShowChili] = useState(false);
  const [openingChili, setOpeningChili] = useState(false);
  const [chiliStep, setChiliStep] = useState<string | null>(null);
  const revision = project.revisions[0];
  const messages = project.conversations[0]?.messages ?? [];
  const latestRun = project.agentRuns?.[0];
  const stepArtifact = revision?.artifacts.find((file) => file.kind === 'STEP');
  const feed = useMemo(() => events.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [events]);

  useEffect(() => {
    if (!busy || !activeJobId) return;
    const stream = new EventSource(`/api/builds/${activeJobId}/events`);
    setStreamState('connecting');
    stream.onopen = () => setStreamState('live');
    stream.addEventListener('build', (message) => {
      const nextEvent = JSON.parse((message as MessageEvent).data) as Event;
      setEvents((current) => current.some((event) => event.id === nextEvent.id) ? current : [...current, nextEvent]);
    });
    stream.addEventListener('complete', async () => {
      stream.close();
      const response = await fetch(`/api/projects/${project.slug}`, { cache: 'no-store' });
      const data = await response.json();
      if (response.ok && data.project) {
        setProject(data.project);
        setEvents(data.project.jobs[0]?.events ?? []);
      }
      setBusy(false);
      setActiveJobId(null);
      setStreamState('offline');
    });
    stream.onerror = () => setStreamState(stream.readyState === EventSource.CLOSED ? 'reconnecting' : 'live');
    return () => stream.close();
  }, [activeJobId, busy, project.slug]);

  const build = async () => {
    if (!prompt.trim()) return;
    if (planMode) {
      const response = await fetch(`/api/projects/${project.slug}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, mode: 'plan' }) });
      const data = await response.json();
      if (response.ok) setPendingRun(data.run);
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/projects/${project.slug}/builds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, parentRevisionId: revision?.id }) });
    const data = await response.json();
    if (!response.ok) { setBusy(false); return; }
    setProject((current) => ({ ...current, jobs: [{ ...data.job, events: [] }, ...current.jobs] }));
    setActiveJobId(data.job.id);
    setStreamState('connecting');
    setEvents([]);
    setPrompt('');
  };

  const decidePlan = async (decision: 'approve' | 'reject') => {
    if (!pendingRun) return;
    const response = await fetch(`/api/agent-runs/${pendingRun.id}/approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
    const data = await response.json();
    if (response.ok && decision === 'approve') {
      setBusy(true);
      setProject((current) => ({ ...current, jobs: [{ ...data.job, events: [] }, ...current.jobs] }));
      setActiveJobId(data.job.id);
      setStreamState('connecting');
      setEvents([]);
    }
    setPendingRun(null);
  };

  const editInChiliCad = async () => {
    if (!revision || !stepArtifact || openingChili) return;
    setOpeningChili(true);
    const response = await fetch(`/api/artifacts/${stepArtifact.id}`);
    if (!response.ok) { setOpeningChili(false); return; }
    setChiliStep(await response.text());
    window.localStorage.setItem(HANDOFF_TO_CHILI_NAME, project.title);
    setShowChili(true); setOpeningChili(false);
  };

  const publish = async () => {
    if (!revision) return;
    await fetch(`/api/projects/${project.slug}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisionId: revision.id }) });
    setProject((current) => ({ ...current, visibility: 'PUBLIC' }));
  };

  return <main className="codex-workspace">
    <header className="codex-topbar"><a href="/projects" className="codex-back">Projects</a><span className="codex-divider">/</span><div className="codex-project-title"><strong>{project.title}</strong><span>{project.visibility === 'PUBLIC' ? 'Published' : 'Private draft'}</span></div><div className="codex-top-actions"><Button variant="outline" onClick={publish} disabled={!revision?.isValid || project.visibility === 'PUBLIC'}>Publish</Button><Button onClick={editInChiliCad} disabled={!stepArtifact || openingChili}>{openingChili ? 'Opening…' : 'Open ChiliCAD'}</Button></div></header>
    <div className="codex-body">
      <aside className="codex-sidebar"><div className="codex-sidebar-section"><span className="codex-label">PROJECT</span><a className="codex-sidebar-link active" href="#conversation">Conversation</a><a className="codex-sidebar-link" href="#plan">Plan & approvals</a><a className="codex-sidebar-link" href="#artifacts">Artifacts</a></div><div className="codex-sidebar-section"><span className="codex-label">RUNS</span>{project.agentRuns?.length ? project.agentRuns.slice(0, 5).map((run) => <div className="codex-run-row" key={run.id}><span className={`codex-status-dot codex-status-${run.status.toLowerCase()}`} /><div><strong>{run.mode === 'plan' ? 'Plan run' : 'Build run'}</strong><span>{run.status.replaceAll('_', ' ')}</span></div></div>) : <p className="codex-muted">No runs yet.</p>}</div><div className="codex-sidebar-footer"><span className="codex-label">ENGINE</span><span>Replicad + OpenCascade</span><span>Chili3D workspace port</span></div></aside>
      <section className="codex-conversation" id="conversation"><div className="codex-conversation-scroll"><div className="codex-conversation-inner">{messages.length ? messages.map((message) => <article className={`codex-message codex-message-${message.role}`} key={message.id}><span className="codex-message-author">{message.role === 'user' ? 'You' : 'Agentic CAD'}</span><EngineeringMarkdown>{message.content}</EngineeringMarkdown></article>) : <div className="codex-welcome"><span className="codex-label">NEW DESIGN RUN</span><h1>What are you building?</h1><p>Describe the part, constraints, and intended use. The agent will return an editable Replicad revision with inspectable outputs.</p><div className="codex-starter-list"><button type="button" onClick={() => setPrompt('Create a spur gear with 20 teeth, module 2, a 10 mm bore, and 5 mm thickness.')}>Create a spur gear</button><button type="button" onClick={() => setPrompt('Create a compact desktop stand with a stable base and cable channel.')}>Create a desktop stand</button></div></div>}{latestRun && <section className="codex-run-card" id="plan"><div className="codex-run-card-head"><span className="codex-label">CURRENT RUN</span><strong>{latestRun.status.replaceAll('_', ' ')}</strong></div>{latestRun.steps.map((step) => <div className="codex-step" key={step.id}><span className={`codex-status-dot codex-status-${step.status.toLowerCase()}`} /><div><strong>{step.title}</strong><span>{step.summary ?? step.status.toLowerCase()}</span></div></div>)}</section>}{(busy || feed.length > 0) && <section className="codex-event-stream" aria-live="polite"><div className="codex-run-card-head"><span className="codex-label">EXECUTION TIMELINE</span><span className={`codex-stream-state codex-stream-${streamState}`}><span className="codex-status-dot codex-status-running" />{streamState === 'live' ? 'Live' : streamState === 'reconnecting' ? 'Reconnecting…' : streamState === 'connecting' ? 'Connecting…' : 'Complete'}</span></div>{feed.slice(-8).map((event) => { const Icon = iconFor(event.stage); return <div className="codex-event-row" key={event.id}><Icon size={14} /><div><strong>{event.summary}</strong><span>{event.agent}{event.tool ? ` · ${event.tool}` : ''}</span></div></div>; })}</section>}{busy && <div className="codex-live-state"><span className="codex-status-dot codex-status-running" />Building and validating the next revision…</div>}{pendingRun && <section className="codex-approval"><span className="codex-label">APPROVAL REQUIRED</span><h2>Review the execution plan</h2><p>{pendingRun.approvals[0]?.explanation}</p><small>Risk: {pendingRun.approvals[0]?.risk}</small><div><Button onClick={() => decidePlan('approve')}>Approve and build</Button><Button variant="outline" onClick={() => decidePlan('reject')}>Reject</Button></div></section>}</div></div><div className="codex-composer"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a part or refine this project…" aria-label="Design request" /><div className="codex-composer-footer"><Button variant="outline" onClick={() => setPlanMode((current) => !current)} aria-pressed={planMode}>{planMode ? 'Plan mode on' : 'Plan first'}</Button><span className="codex-composer-hint">Enter a brief to create an editable revision</span><Button onClick={build} disabled={busy || !prompt.trim()}><Send />{planMode ? 'Create plan' : busy ? 'Building' : 'Build revision'}</Button></div></div></section>
      <aside className={`codex-inspector ${showChili ? 'codex-inspector-chili' : ''}`} id="artifacts">{showChili ? <ChiliEditor embedded projectSlug={project.slug} parentRevisionId={revision?.id ?? null} stepText={chiliStep} /> : <><div className="codex-inspector-header"><div><span className="codex-label">INSPECTOR</span><h2>{revision ? `Revision ${revision.revisionNumber}` : 'No revision yet'}</h2></div><span className={`codex-validity ${revision?.isValid ? 'valid' : ''}`}>{revision?.isValid ? 'Validated' : 'Awaiting build'}</span></div><div className="codex-viewport"><div className="codex-viewport-grid" /><div className="codex-viewport-empty"><Box /><span>{revision ? 'CAD preview ready' : 'Your model will appear here'}</span><small>{revision ? 'Open ChiliCAD to edit the generated solid.' : 'Build a revision to create the first solid.'}</small></div></div><Dock disableMagnification className="codex-dock"><DockIcon><button type="button" aria-label="Inspect geometry" title="Inspect geometry"><Eye /></button></DockIcon><DockIcon><button type="button" aria-label="Measure geometry" title="Measure geometry"><Ruler /></button></DockIcon><DockIcon><button type="button" aria-label="Open ChiliCAD" title="Open ChiliCAD" onClick={editInChiliCad} disabled={!stepArtifact}><Box /></button></DockIcon><DockIcon><button type="button" aria-label="Download STEP" title="Download STEP" onClick={() => stepArtifact && window.open(`/api/artifacts/${stepArtifact.id}`, '_blank')} disabled={!stepArtifact}><Download /></button></DockIcon></Dock><Accordion type="multiple" className="codex-inspector-sections"><AccordionItem value="metrics"><AccordionTrigger>Revision metrics</AccordionTrigger><AccordionContent>{revision?.metrics ? <dl className="codex-metrics"><div><dt>Volume</dt><dd>{revision.metrics.volume?.toLocaleString()} mm³</dd></div><div><dt>Surface area</dt><dd>{revision.metrics.surfaceArea?.toLocaleString()} mm²</dd></div></dl> : <p className="codex-muted">Metrics will appear after validation.</p>}</AccordionContent></AccordionItem><AccordionItem value="files"><AccordionTrigger>Artifacts</AccordionTrigger><AccordionContent>{revision?.artifacts.length ? revision.artifacts.map((file) => <a className="codex-artifact" href={`/api/artifacts/${file.id}`} key={file.id}><FileCode2 /><span>{file.filename}</span><small>{file.kind}</small></a>) : <p className="codex-muted">Build outputs, blueprints, sketches, and exports will appear here.</p>}</AccordionContent></AccordionItem></Accordion></>}</aside>
    </div>
  </main>;
}
