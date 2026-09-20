'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, CheckCircle2, Download, FileCode2, Hammer, Send, Wrench } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/magicui/accordion';
import { Button } from '@/components/magicui/button';
import { Dock, DockIcon } from '@/components/magicui/dock';
import { EngineeringMarkdown } from '@/components/projects/engineering-markdown';
import { ChiliEditor } from '@/components/cad/chili-editor';
import { HANDOFF_TO_CHILI_NAME } from '@/components/cad/cad-handoff';

type BuildEvent = { id: string; stage: string; agent: string; tool?: string | null; summary: string; detail?: Record<string, unknown> | null; createdAt: string };
type AgentEvent = { id: string; type: string; summary: string; payload?: { agent?: string; tool?: string; detail?: Record<string, unknown> } | null; createdAt: string };
type Artifact = { id: string; filename: string; kind: string };
type RunStep = { id: string; title: string; status: string; summary: string | null };
type Subagent = { id: string; role: string; status: string; summary: string | null };
type AgentRun = { id: string; status: string; mode: string; steps: RunStep[]; subagents: Subagent[]; approvals: Array<{ id: string; status: string; action: string; risk?: string; explanation?: string }> };
type Project = { slug: string; title: string; visibility: string; revisions: Array<{ id: string; revisionNumber: number; isValid: boolean; metrics: { volume?: number; surfaceArea?: number } | null; artifacts: Artifact[] }>; jobs: Array<{ id: string; status: string; events: BuildEvent[] }>; conversations: Array<{ messages: Array<{ id: string; role: string; content: string; createdAt: string }> }>; agentRuns?: AgentRun[] };
type PendingRun = { id: string; approvals: Array<{ id: string; action: string; risk: string; explanation: string }> };
type StreamState = 'offline' | 'connecting' | 'live' | 'reconnecting';
type InspectorTab = 'run' | 'plan' | 'viewport' | 'files' | 'agents';

const iconFor = (stage: string) => stage === 'evaluate' ? CheckCircle2 : stage === 'generate' ? FileCode2 : stage === 'repair' ? Wrench : Hammer;
const activeStatuses = ['QUEUED', 'PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'VALIDATING'];

export function ProjectWorkspace({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState(initialProject);
  const [prompt, setPrompt] = useState('');
  const initialJob = initialProject.jobs[0];
  const initialRun = initialProject.agentRuns?.find((run) => activeStatuses.includes(run.status));
  const [events, setEvents] = useState<BuildEvent[]>(initialRun ? [] : initialJob?.events ?? []);
  const [activeRunId, setActiveRunId] = useState<string | null>(initialRun?.id ?? null);
  const [busy, setBusy] = useState(Boolean(initialRun) || ['QUEUED', 'RUNNING'].includes(initialJob?.status ?? ''));
  const [streamState, setStreamState] = useState<StreamState>(initialRun || ['QUEUED', 'RUNNING'].includes(initialJob?.status ?? '') ? 'connecting' : 'offline');
  const [planMode, setPlanMode] = useState(false);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);
  const [showChili, setShowChili] = useState(false);
  const [openingChili, setOpeningChili] = useState(false);
  const [chiliStep, setChiliStep] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('run');

  const revision = project.revisions[0];
  const messages = project.conversations[0]?.messages ?? [];
  const latestRun = project.agentRuns?.[0];
  const stepArtifact = revision?.artifacts.find((file) => file.kind === 'STEP');
  const feed = useMemo(() => events.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [events]);

  const refreshProject = async () => {
    const response = await fetch(`/api/projects/${project.slug}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.project) return;
    setProject(data.project);
    setEvents(data.project.jobs[0]?.events ?? []);
  };

  useEffect(() => {
    if (!busy || !activeRunId) return;
    const stream = new EventSource(`/api/runs/${activeRunId}/events`);
    setStreamState('connecting');
    stream.onopen = () => setStreamState('live');
    stream.addEventListener('agent', (message) => {
      const event = JSON.parse((message as MessageEvent).data) as AgentEvent;
      const payload = event.payload ?? {};
      const nextEvent: BuildEvent = { id: event.id, stage: event.type.split('.')[0], agent: payload.agent ?? 'agent', tool: payload.tool, detail: payload.detail, summary: event.summary, createdAt: event.createdAt };
      setEvents((current) => current.some((item) => item.id === nextEvent.id) ? current : [...current, nextEvent]);
    });
    stream.addEventListener('complete', async () => {
      stream.close();
      await refreshProject();
      setBusy(false);
      setActiveRunId(null);
      setStreamState('offline');
    });
    stream.onerror = () => setStreamState(stream.readyState === EventSource.CLOSED ? 'reconnecting' : 'live');
    return () => stream.close();
  }, [activeRunId, busy, project.slug]);

  const build = async () => {
    if (!prompt.trim()) return;
    if (planMode) {
      const response = await fetch(`/api/projects/${project.slug}/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, mode: 'plan' }) });
      const data = await response.json();
      if (response.ok) {
        setPendingRun(data.run);
        setProject((current) => ({ ...current, agentRuns: [{ ...data.run, subagents: data.run.subagents ?? [], approvals: data.run.approvals ?? [], steps: data.run.steps ?? [] }, ...(current.agentRuns ?? [])] }));
        setInspectorTab('plan');
        setPrompt('');
      }
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/projects/${project.slug}/builds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, parentRevisionId: revision?.id }) });
    const data = await response.json();
    if (!response.ok) { setBusy(false); return; }
    setProject((current) => ({ ...current, jobs: [{ ...data.job, events: [] }, ...current.jobs], agentRuns: [{ ...data.run, subagents: data.run.subagents ?? [], approvals: data.run.approvals ?? [], steps: data.run.steps ?? [] }, ...(current.agentRuns ?? [])] }));
    setActiveRunId(data.run.id);
    setStreamState('connecting');
    setEvents([]);
    setPrompt('');
    setInspectorTab('run');
  };

  const decidePlan = async (decision: 'approve' | 'reject') => {
    if (!pendingRun) return;
    const response = await fetch(`/api/agent-runs/${pendingRun.id}/approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
    const data = await response.json();
    if (response.ok && decision === 'approve' && data.run) { setBusy(true); setActiveRunId(data.run.id); setStreamState('connecting'); setEvents([]); setInspectorTab('run'); }
    setPendingRun(null);
    await refreshProject();
  };

  const cancelRun = async () => {
    if (!activeRunId) return;
    const response = await fetch(`/api/runs/${activeRunId}/cancel`, { method: 'POST' });
    if (!response.ok) return;
    setBusy(false); setActiveRunId(null); setStreamState('offline'); await refreshProject();
  };

  const retryRun = async () => {
    if (!latestRun || !['FAILED', 'CANCELLED'].includes(latestRun.status)) return;
    const response = await fetch(`/api/runs/${latestRun.id}/retry`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) return;
    setBusy(true); setActiveRunId(data.run.id); setStreamState('connecting'); setEvents([]);
  };

  const editInChiliCad = async () => {
    if (!revision || !stepArtifact || openingChili) return;
    setOpeningChili(true);
    const response = await fetch(`/api/artifacts/${stepArtifact.id}`);
    if (!response.ok) { setOpeningChili(false); return; }
    setChiliStep(await response.text());
    window.localStorage.setItem(HANDOFF_TO_CHILI_NAME, project.title);
    setShowChili(true); setInspectorTab('viewport'); setOpeningChili(false);
  };

  const publish = async () => {
    if (!revision) return;
    const response = await fetch(`/api/projects/${project.slug}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisionId: revision.id }) });
    if (response.ok) setProject((current) => ({ ...current, visibility: 'PUBLIC' }));
  };

  const inspectorTabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'run', label: 'Run' }, { id: 'plan', label: 'Plan' }, { id: 'viewport', label: 'Viewport' }, { id: 'files', label: 'Files' }, { id: 'agents', label: 'Agents' },
  ];

  return <main className={`codex-workspace ${showChili ? 'codex-workspace-chili' : ''}`}>
    <header className="codex-topbar"><a href="/projects" className="codex-back">Projects</a><span className="codex-divider">/</span><div className="codex-project-title"><strong>{project.title}</strong><span>{project.visibility === 'PUBLIC' ? 'Published' : 'Private draft'}</span></div><div className="codex-top-actions"><Button variant="outline" onClick={publish} disabled={!revision?.isValid || project.visibility === 'PUBLIC'}>Publish</Button><Button onClick={editInChiliCad} disabled={!stepArtifact || openingChili}>{openingChili ? 'Opening…' : 'Open ChiliCAD'}</Button></div></header>
    <div className="codex-body">
      <aside className="codex-sidebar"><div className="codex-sidebar-section"><span className="codex-label">PROJECT</span><a className="codex-sidebar-link active" href="#conversation">Conversation</a><a className="codex-sidebar-link" href="#plan">Plan & approvals</a><a className="codex-sidebar-link" href="#artifacts">Artifacts</a></div><div className="codex-sidebar-section"><span className="codex-label">RUNS</span>{project.agentRuns?.length ? project.agentRuns.slice(0, 5).map((run) => <div className="codex-run-row" key={run.id}><span className={`codex-status-dot codex-status-${run.status.toLowerCase()}`} /><div><strong>{run.mode === 'plan' ? 'Plan run' : 'Build run'}</strong><span>{run.status.replaceAll('_', ' ')}</span></div></div>) : <p className="codex-muted">No runs yet.</p>}</div><div className="codex-sidebar-footer"><span className="codex-label">ENGINE</span><span>Replicad + OpenCascade</span><span>Chili3D workspace port</span></div></aside>
      <section className="codex-conversation" id="conversation"><div className="codex-conversation-scroll"><div className="codex-conversation-inner">{messages.length ? messages.map((message) => <article className={`codex-message codex-message-${message.role}`} key={message.id}><span className="codex-message-author">{message.role === 'user' ? 'You' : 'Agentic CAD'}</span><EngineeringMarkdown>{message.content}</EngineeringMarkdown></article>) : <div className="codex-welcome"><span className="codex-label">NEW DESIGN RUN</span><h1>What are you building?</h1><p>Describe the part, constraints, and intended use. The agent will return an editable Replicad revision with inspectable outputs.</p><div className="codex-starter-list"><button type="button" onClick={() => setPrompt('Create a spur gear with 20 teeth, module 2, a 10 mm bore, and 5 mm thickness.')}>Create a spur gear</button><button type="button" onClick={() => setPrompt('Create a compact desktop stand with a stable base and cable channel.')}>Create a desktop stand</button></div></div>}{latestRun && <section className="codex-run-card" id="plan"><div className="codex-run-card-head"><span className="codex-label">CURRENT RUN</span><strong>{busy ? 'executing' : latestRun.status.replaceAll('_', ' ')}</strong></div>{latestRun.steps.map((step) => <div className="codex-step" key={step.id}><span className={`codex-status-dot codex-status-${step.status.toLowerCase()}`} /><div><strong>{step.title}</strong><span>{step.summary ?? step.status.toLowerCase()}</span></div></div>)}{latestRun.subagents.length > 0 && <div className="codex-subagents"><span className="codex-label">SUBAGENTS</span>{latestRun.subagents.map((subagent) => <div className="codex-subagent" key={subagent.id}><span className={`codex-status-dot codex-status-${subagent.status.toLowerCase()}`} /><div><strong>{subagent.role}</strong><span>{subagent.summary ?? subagent.status.toLowerCase()}</span></div></div>)}</div>}</section>}{(busy || feed.length > 0) && <section className="codex-event-stream" aria-live="polite"><div className="codex-run-card-head"><div><span className="codex-label">EXECUTION TIMELINE</span><span className={`codex-stream-state codex-stream-${streamState}`}><span className="codex-status-dot codex-status-running" />{streamState === 'live' ? 'Live' : streamState === 'reconnecting' ? 'Reconnecting…' : streamState === 'connecting' ? 'Connecting…' : 'Complete'}</span></div><div className="codex-run-actions">{busy && <Button variant="outline" onClick={cancelRun}>Cancel</Button>}{!busy && latestRun && ['FAILED', 'CANCELLED'].includes(latestRun.status) && <Button variant="outline" onClick={retryRun}>Retry</Button>}</div></div>{feed.slice(-8).map((event) => { const Icon = iconFor(event.stage); return <div className="codex-event-row" key={event.id}><Icon size={14} /><div><strong>{event.summary}</strong><span>{event.agent}{event.tool ? ` · ${event.tool}` : ''}</span></div></div>; })}</section>}{busy && <div className="codex-live-state"><span className="codex-status-dot codex-status-running" />Building and validating the next revision…</div>}{pendingRun && <section className="codex-approval"><span className="codex-label">APPROVAL REQUIRED</span><h2>Review the execution plan</h2><p>{pendingRun.approvals[0]?.explanation}</p><small>Risk: {pendingRun.approvals[0]?.risk}</small><div><Button onClick={() => decidePlan('approve')}>Approve and build</Button><Button variant="outline" onClick={() => decidePlan('reject')}>Reject</Button></div></section>}</div></div><div className="codex-composer"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe a part or refine this project…" aria-label="Design request" /><div className="codex-composer-footer"><Button variant="outline" onClick={() => setPlanMode((current) => !current)} aria-pressed={planMode}>{planMode ? 'Plan mode on' : 'Plan first'}</Button><span className="codex-composer-hint">Enter a brief to create an editable revision</span><Button onClick={build} disabled={busy || !prompt.trim()}><Send />{planMode ? 'Create plan' : busy ? 'Building' : 'Build revision'}</Button></div></div></section>
      <aside className={`codex-inspector ${showChili ? 'codex-inspector-chili' : ''}`} id="artifacts"><nav className="codex-inspector-tabs" aria-label="Project inspector">{inspectorTabs.map((tab) => <button type="button" role="tab" aria-selected={inspectorTab === tab.id} className={inspectorTab === tab.id ? 'active' : ''} key={tab.id} onClick={() => setInspectorTab(tab.id)}>{tab.label}</button>)}</nav>{inspectorTab === 'viewport' && (showChili ? <ChiliEditor embedded projectSlug={project.slug} parentRevisionId={revision?.id ?? null} stepText={chiliStep} /> : <><div className="codex-inspector-header"><div><span className="codex-label">VIEWPORT</span><h2>{revision ? `Revision ${revision.revisionNumber}` : 'No revision yet'}</h2></div><span className={`codex-validity ${revision?.isValid ? 'valid' : ''}`}>{revision?.isValid ? 'Validated' : 'Awaiting build'}</span></div><div className="codex-viewport"><div className="codex-viewport-grid" /><div className="codex-viewport-empty"><Box /><span>{revision ? 'ChiliCAD is ready' : 'Your model will appear here'}</span><small>{revision ? 'Open ChiliCAD to edit the generated solid.' : 'Build a revision to create the first solid.'}</small></div></div><Dock disableMagnification className="codex-dock"><DockIcon><button type="button" aria-label="Open ChiliCAD" title="Open ChiliCAD" onClick={editInChiliCad} disabled={!stepArtifact}><Box /></button></DockIcon><DockIcon><button type="button" aria-label="Download STEP" title="Download STEP" onClick={() => stepArtifact && window.open(`/api/artifacts/${stepArtifact.id}`, '_blank')} disabled={!stepArtifact}><Download /></button></DockIcon></Dock></>)}{inspectorTab === 'run' && <section className="codex-inspector-section"><span className="codex-label">RUN</span><h2>{busy ? 'Execution in progress' : latestRun ? latestRun.status.replaceAll('_', ' ') : 'No active run'}</h2><p className="codex-muted">{streamState === 'live' ? 'Receiving ordered agent events.' : 'Run state is persisted to the project.'}</p>{busy && <Button variant="outline" onClick={cancelRun}>Cancel run</Button>}{!busy && latestRun && ['FAILED', 'CANCELLED'].includes(latestRun.status) && <Button onClick={retryRun}>Retry run</Button>}</section>}{inspectorTab === 'plan' && <section className="codex-inspector-section"><span className="codex-label">PLAN</span><h2>{pendingRun ? 'Approval required' : 'Execution plan'}</h2>{pendingRun ? <><p>{pendingRun.approvals[0]?.explanation}</p><small>Risk: {pendingRun.approvals[0]?.risk}</small><div className="codex-approval-actions"><Button onClick={() => decidePlan('approve')}>Approve</Button><Button variant="outline" onClick={() => decidePlan('reject')}>Reject</Button></div></> : latestRun?.steps.map((step) => <div className="codex-step" key={step.id}><span className={`codex-status-dot codex-status-${step.status.toLowerCase()}`} /><div><strong>{step.title}</strong><span>{step.summary ?? step.status.toLowerCase()}</span></div></div>)}</section>}{inspectorTab === 'files' && <section className="codex-inspector-section"><span className="codex-label">FILES</span><h2>Project outputs</h2>{revision?.artifacts.length ? revision.artifacts.map((file) => <a className="codex-artifact" href={`/api/artifacts/${file.id}`} key={file.id}><FileCode2 /><span>{file.filename}</span><small>{file.kind}</small></a>) : <p className="codex-muted">Build outputs, blueprints, sketches, and exports will appear here.</p>}{revision?.metrics && <Accordion type="single" collapsible className="codex-inspector-sections"><AccordionItem value="metrics"><AccordionTrigger>Revision metrics</AccordionTrigger><AccordionContent><dl className="codex-metrics"><div><dt>Volume</dt><dd>{revision.metrics.volume?.toLocaleString()} mm³</dd></div><div><dt>Surface area</dt><dd>{revision.metrics.surfaceArea?.toLocaleString()} mm²</dd></div></dl></AccordionContent></AccordionItem></Accordion>}</section>}{inspectorTab === 'agents' && <section className="codex-inspector-section"><span className="codex-label">AGENTS</span><h2>Subagents</h2>{latestRun?.subagents.length ? latestRun.subagents.map((subagent) => <div className="codex-subagent" key={subagent.id}><span className={`codex-status-dot codex-status-${subagent.status.toLowerCase()}`} /><div><strong>{subagent.role}</strong><span>{subagent.summary ?? subagent.status.toLowerCase()}</span></div></div>) : <p className="codex-muted">Subagents appear when a run starts.</p>}</section>}</aside>
    </div>
  </main>;
}
