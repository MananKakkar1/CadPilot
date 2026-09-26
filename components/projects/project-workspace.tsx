'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  AlertCircle, Box, Check, ChevronDown, Code2, FileCode2, Files, GitBranch, Hammer,
  Layers, Maximize2, Moon, PencilRuler, Share2, Sun, X,
} from 'lucide-react';
import { EngineeringMarkdown } from '@/components/projects/engineering-markdown';
import { CadWorkbench } from '@/components/cad/cad-workbench';
import { HANDOFF_TO_CHILI_NAME } from '@/components/cad/cad-handoff';
import { AgentComposer, type AgentMode } from './agent-composer';
import { AgentMarkers } from './agent-markers';
import { DrawingViewer } from './drawing-viewer';
import { VersionPanel, type PanelRevision } from './version-panel';
import { WorkspaceFilePreview } from './workspace-file-preview';

type BuildEvent = { id: string; stage: string; agent: string; tool?: string | null; summary: string; detail?: Record<string, unknown> | null; createdAt: string };
type AgentEvent = { id: string; type: string; summary: string; payload?: { agent?: string; tool?: string; detail?: Record<string, unknown> } | null; createdAt: string };
type Artifact = { id: string; filename: string; kind: string };
type Revision = PanelRevision & { sourceCode?: string; validation?: { complete?: boolean; warnings?: string[]; findings?: string[] } | null };
type RunStep = { id: string; title: string; status: string; summary: string | null };
type AgentRun = { id: string; status: string; mode: string; steps: RunStep[]; subagents: Array<{ id: string; role: string; status: string; summary: string | null }>; approvals: Array<{ id: string; status: string; action: string; risk?: string; explanation?: string }> };
type ChatMessage = { id: string; role: string; content: string; createdAt: string };
type Project = {
  slug: string; title: string; visibility: string; publishedRevisionId?: string | null;
  revisions: Revision[];
  jobs: Array<{ id: string; status: string; events: BuildEvent[] }>;
  conversations: Array<{ messages: ChatMessage[] }>;
  agentRuns?: AgentRun[];
};
type StreamState = 'offline' | 'connecting' | 'live' | 'reconnecting';
type TabId = 'preview' | 'blueprint' | 'sketch' | 'code' | 'files' | 'versions' | 'review';

const ACTIVE_STATUSES = ['QUEUED', 'PLANNING', 'EXECUTING', 'VALIDATING'];
const SPLIT_KEY = 'cadpilot:split';
const THEME_KEY = 'cadpilot:theme';

const TABS: Array<{ id: TabId; label: string; icon: typeof Box }> = [
  { id: 'preview', label: 'Preview', icon: Box },
  { id: 'blueprint', label: 'Blueprint', icon: PencilRuler },
  { id: 'sketch', label: 'Sketch', icon: Layers },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'files', label: 'Files', icon: Files },
  { id: 'versions', label: 'Versions', icon: GitBranch },
  { id: 'review', label: 'Review', icon: Check },
];

export function ProjectWorkspace({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState(initialProject);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<AgentMode>('build');
  const initialRun = initialProject.agentRuns?.find((run) => ACTIVE_STATUSES.includes(run.status));
  const [events, setEvents] = useState<BuildEvent[]>(initialRun ? [] : initialProject.jobs[0]?.events ?? []);
  const [activeRunId, setActiveRunId] = useState<string | null>(initialRun?.id ?? null);
  const [busy, setBusy] = useState(Boolean(initialRun) || ['QUEUED', 'RUNNING'].includes(initialProject.jobs[0]?.status ?? ''));
  const [streamState, setStreamState] = useState<StreamState>(initialRun ? 'connecting' : 'offline');
  const [pendingRun, setPendingRun] = useState<Pick<AgentRun, 'id' | 'approvals'> | null>(initialProject.agentRuns?.find((run) => run.status === 'AWAITING_APPROVAL') ?? null);
  const [requestPending, setRequestPending] = useState(false);
  const requestLock = useRef(false);
  const [chiliStep, setChiliStep] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('preview');
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [split, setSplit] = useState(34);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'shared' | 'published' | 'unpublished' | 'failed'>('idle');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mobileView, setMobileView] = useState<'chat' | 'panel'>('chat');
  // Reasoning attached to a chat answer, keyed by the assistant message it belongs to.
  const [chatThoughts, setChatThoughts] = useState<Record<string, string>>({});
  const threadEnd = useRef<HTMLDivElement>(null);

  const completedRevisions = useMemo(
    () => project.revisions.filter((item) => item.isValid && !item.archivedAt).sort((a, b) => b.revisionNumber - a.revisionNumber),
    [project.revisions],
  );
  const latestCompleted = completedRevisions[0];
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(latestCompleted?.id ?? null);
  const revision = completedRevisions.find((item) => item.id === selectedRevisionId) ?? latestCompleted;
  const incompleteRevisions = project.revisions.filter((item) => !item.isValid && !item.archivedAt);
  const messages = project.conversations[0]?.messages ?? [];
  const latestRun = project.agentRuns?.[0];
  const stepArtifact = revision?.artifacts.find((file) => file.kind === 'STEP');
  const feed = useMemo(() => events.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [events]);
  const revisionLabel = revision ? (revision.label || `Revision ${revision.revisionNumber}`) : 'No revision yet';
  const warnings = Array.isArray(revision?.validation?.warnings) ? revision.validation.warnings : [];
  const exportsConfirmed = revision?.validation?.complete === true && Array.isArray(revision.validation.warnings) && warnings.length === 0;
  const canPublish = Boolean(revision && project.publishedRevisionId !== revision.id && exportsConfirmed);
  const manualBase = Boolean(revision?.sourceCode?.includes('This revision was edited directly in ChiliCAD'));
  const conversing = mode === 'ask';

  /* ---------- persisted chrome ---------- */
  useEffect(() => {
    try {
      const storedSplit = Number(window.localStorage.getItem(SPLIT_KEY));
      if (Number.isFinite(storedSplit) && storedSplit >= 22 && storedSplit <= 62) setSplit(storedSplit);
      const storedTheme = window.localStorage.getItem(THEME_KEY);
      const next = storedTheme === 'dark' || storedTheme === 'light'
        ? storedTheme
        : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      setTheme(next);
      document.documentElement.dataset.theme = next;
    } catch { /* private mode: keep the defaults */ }
  }, []);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
  };

  /* ---------- revision <-> url ---------- */
  useEffect(() => {
    if (selectedRevisionId && completedRevisions.some((item) => item.id === selectedRevisionId)) return;
    setSelectedRevisionId(latestCompleted?.id ?? null);
  }, [latestCompleted?.id, selectedRevisionId, completedRevisions]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('revision');
    if (requested && completedRevisions.some((item) => item.id === requested)) setSelectedRevisionId(requested);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedRevisionId) url.searchParams.set('revision', selectedRevisionId);
    else url.searchParams.delete('revision');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [selectedRevisionId]);

  useEffect(() => { threadEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, feed.length, busy]);

  const refreshProject = useCallback(async () => {
    const response = await fetch(`/api/projects/${project.slug}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.project) throw new Error(data.error ?? 'Unable to refresh project.');
    setProject(data.project);
    setEvents(data.project.jobs[0]?.events ?? []);
  }, [project.slug]);

  /* ---------- live run stream ---------- */
  useEffect(() => {
    if (!busy || !activeRunId) return;
    const stream = new EventSource(`/api/runs/${activeRunId}/events`);
    setStreamState('connecting');
    stream.onopen = () => setStreamState('live');
    stream.addEventListener('agent', (message) => {
      const event = JSON.parse((message as MessageEvent).data) as AgentEvent;
      const payload = event.payload ?? {};
      const next: BuildEvent = { id: event.id, stage: event.type, agent: payload.agent ?? 'agent', tool: payload.tool, detail: payload.detail, summary: event.summary, createdAt: event.createdAt };
      setEvents((current) => (current.some((item) => item.id === next.id) ? current : [...current, next]));
    });
    stream.addEventListener('complete', async () => {
      stream.close(); setBusy(false); setActiveRunId(null); setStreamState('offline');
      try { await refreshProject(); } catch { setErrorMessage('The run ended, but its results could not be refreshed. Reload to recover the saved result.'); }
    });
    stream.onerror = () => setStreamState('reconnecting');
    return () => stream.close();
  }, [activeRunId, busy, refreshProject]);

  useEffect(() => {
    const onSaved = () => { void refreshProject().catch(() => setErrorMessage('Unable to refresh the saved revision. Reload to try again.')); };
    window.addEventListener('cadpilot:revision-saved', onSaved);
    return () => window.removeEventListener('cadpilot:revision-saved', onSaved);
  }, [refreshProject]);

  useEffect(() => {
    if (!stepArtifact) { setChiliStep(null); return; }
    let cancelled = false;
    fetch(`/api/artifacts/${stepArtifact.id}`)
      .then((response) => (response.ok ? response.text() : null))
      .then((step) => { if (!cancelled && step) setChiliStep(step); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [stepArtifact?.id]);

  /* ---------- actions ---------- */
  const submit = async () => {
    if (!prompt.trim() || busy || pendingRun || requestLock.current) return;
    if (conversing) return askQuestion();
    requestLock.current = true; setRequestPending(true); setErrorMessage(null); setActiveTab('review'); setMobileView('chat');
    const planMode = mode === 'plan';
    try {
      const response = await fetch(`/api/projects/${project.slug}${planMode ? '/runs' : '/builds'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, parentRevisionId: revision?.id, ...(planMode ? { mode: 'plan' } : {}) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.run || (!planMode && !data.job)) {
        throw new Error(data?.error ?? 'The request could not be confirmed. Reload to check existing runs before retrying.');
      }
      const run = { ...data.run, subagents: data.run.subagents ?? [], approvals: data.run.approvals ?? [], steps: data.run.steps ?? [] };
      setProject((current) => ({ ...current, jobs: data.job ? [{ ...data.job, events: [] }, ...current.jobs] : current.jobs, agentRuns: [run, ...(current.agentRuns ?? [])] }));
      if (planMode) setPendingRun(run);
      else { setBusy(true); setActiveRunId(run.id); setStreamState('connecting'); setEvents([]); }
      setPrompt('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to send the request.');
    } finally { requestLock.current = false; setRequestPending(false); }
  };

  /** Ask mode: a conversation turn. Never queues a job or touches geometry. */
  const askQuestion = async () => {
    requestLock.current = true; setRequestPending(true); setErrorMessage(null); setMobileView('chat');
    const question = prompt;
    const optimisticId = `pending-${Date.now()}`;
    setProject((current) => {
      const [conversation, ...rest] = current.conversations.length ? current.conversations : [{ messages: [] as ChatMessage[] }];
      return { ...current, conversations: [{ ...conversation, messages: [...conversation.messages, { id: optimisticId, role: 'user', content: question, createdAt: new Date().toISOString() }] }, ...rest] };
    });
    setPrompt('');
    try {
      const response = await fetch(`/api/projects/${project.slug}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, revisionId: revision?.id ?? null }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.reply) throw new Error(data?.error ?? 'The assistant could not answer.');
      setProject((current) => {
        const [conversation, ...rest] = current.conversations;
        const kept = conversation.messages.filter((item) => item.id !== optimisticId);
        return { ...current, conversations: [{ ...conversation, messages: [...kept, ...data.messages] }, ...rest] };
      });
      if (data.thoughts && data.messages?.[1]?.id) setChatThoughts((current) => ({ ...current, [data.messages[1].id]: data.thoughts }));
    } catch (error) {
      // Drop the optimistic turn and give the text back so nothing is silently lost.
      setProject((current) => {
        const [conversation, ...rest] = current.conversations;
        return { ...current, conversations: [{ ...conversation, messages: conversation.messages.filter((item) => item.id !== optimisticId) }, ...rest] };
      });
      setPrompt(question);
      setErrorMessage(error instanceof Error ? error.message : 'The assistant could not answer.');
    } finally { requestLock.current = false; setRequestPending(false); }
  };

  const decidePlan = async (decision: 'approve' | 'reject') => {
    if (!pendingRun || requestLock.current) return;
    requestLock.current = true; setRequestPending(true); setErrorMessage(null);
    try {
      const response = await fetch(`/api/agent-runs/${pendingRun.id}/approval`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.run) throw new Error(data?.error ?? 'Unable to confirm the plan decision. Reload to check its status.');
      if (decision === 'approve') { setBusy(true); setActiveRunId(data.run.id); setStreamState('connecting'); setEvents([]); }
      setPendingRun(null);
      await refreshProject();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update the plan.');
    } finally { requestLock.current = false; setRequestPending(false); }
  };

  const cancelRun = async () => {
    if (!activeRunId || requestLock.current) return;
    requestLock.current = true; setRequestPending(true); setErrorMessage(null);
    try {
      const response = await fetch(`/api/runs/${activeRunId}/cancel`, { method: 'POST' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? 'Cancellation could not be confirmed.');
      setBusy(false); setActiveRunId(null); setStreamState('offline');
      await refreshProject();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to cancel this run.');
    } finally { requestLock.current = false; setRequestPending(false); }
  };

  const publish = async (makePublic: boolean) => {
    if (requestLock.current) return;
    if (makePublic && (!revision || !canPublish)) return;
    requestLock.current = true; setRequestPending(true); setErrorMessage(null);
    try {
      const response = await fetch(`/api/projects/${project.slug}/publish`, {
        method: makePublic ? 'POST' : 'DELETE',
        ...(makePublic ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisionId: revision!.id }) } : {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.project) throw new Error(data?.error ?? 'Unable to change publication.');
      setProject((current) => ({ ...current, visibility: data.project.visibility, publishedRevisionId: data.project.publishedRevisionId }));
      setShareState(makePublic ? 'published' : 'unpublished');
      window.setTimeout(() => setShareState('idle'), 3000);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to change publication.');
    } finally { requestLock.current = false; setRequestPending(false); }
  };

  const share = async () => {
    const path = project.visibility === 'PUBLIC' ? `/p/${project.slug}` : `/projects/${project.slug}`;
    const url = new URL(path, window.location.origin).toString();
    try {
      if (project.visibility === 'PUBLIC' && navigator.share) {
        await navigator.share({ title: project.title, url });
        setShareState('shared');
      } else {
        await navigator.clipboard.writeText(url);
        setShareState('copied');
      }
      window.setTimeout(() => setShareState('idle'), 2400);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareState('failed');
      window.setTimeout(() => setShareState('idle'), 3000);
    }
  };

  const openFile = (file: Artifact) => { setPreviewFile(file.id); setActiveTab('files'); setMobileView('panel'); };
  const chooseRevision = (id: string) => { setSelectedRevisionId(id); setActiveTab('preview'); setPreviewFile(null); };

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const percent = Math.min(62, Math.max(22, (pointer.clientX / Math.max(window.innerWidth, 1)) * 100));
      setSplit(percent);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      setSplit((value) => { try { window.localStorage.setItem(SPLIT_KEY, String(value)); } catch { /* ignore */ } return value; });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  const nudgeSplit = (delta: number) => setSplit((value) => {
    const next = Math.min(62, Math.max(22, value + delta));
    try { window.localStorage.setItem(SPLIT_KEY, String(next)); } catch { /* ignore */ }
    return next;
  });

  /* ---------- panels ---------- */
  const reviewPanel = (
    <div className="wk-pad">
      <div className="wk-section">
        <div className="wk-vers-head">
          <h3 className="wk-h2">{busy ? 'Execution in progress' : latestRun ? latestRun.status.replaceAll('_', ' ').toLowerCase() : 'Ready for a request'}</h3>
          {busy && <button type="button" className="wk-btn" onClick={cancelRun} disabled={requestPending}>Cancel</button>}
        </div>
        <div className="wk-status" role="status" aria-live="polite">
          <span className={`wk-dot ${busy ? 'wk-dot-run' : revision?.isValid ? 'wk-dot-ok' : ''}`} />
          <span>{busy
            ? streamState === 'live' ? 'Live build stream' : streamState === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'
            : revision ? (warnings.length ? `Geometry usable · ${warnings.length} export warning${warnings.length === 1 ? '' : 's'}` : exportsConfirmed ? 'Build checks passed · engineering review still required' : 'Export completeness unconfirmed') : 'No completed revision yet'}</span>
        </div>

        {errorMessage && <div className="wk-alert" role="alert"><AlertCircle size={14} /><span>{errorMessage}</span></div>}
        {manualBase && <div className="wk-note"><span className="wk-label">Manual base</span><span>This revision was edited in ChiliCAD and has no executable Replicad source. The next AI request starts a fresh editable source while keeping this revision as its parent.</span></div>}
        {warnings.length > 0 && <div className="wk-note wk-note-warn"><span className="wk-label">Build findings</span><span>{warnings.join(' ')}</span></div>}
        {revision && !exportsConfirmed && <div className="wk-note wk-note-warn"><span className="wk-label">Publishing unavailable</span><span>This revision needs confirmed complete exports with no warnings. Private review stays available.</span></div>}
        {incompleteRevisions.length > 0 && <p className="wk-muted">{incompleteRevisions.length} unfinished revision{incompleteRevisions.length === 1 ? '' : 's'} kept for diagnosis.</p>}

        {pendingRun && (
          <div className="wk-card">
            <span className="wk-label">Approval required</span>
            <p>{pendingRun.approvals[0]?.explanation}</p>
            <span className="wk-muted">Risk: {pendingRun.approvals[0]?.risk}</span>
            <div className="wk-ver-acts">
              <button type="button" className="wk-btn wk-btn-primary" disabled={requestPending} onClick={() => decidePlan('approve')}>Approve and build</button>
              <button type="button" className="wk-btn" disabled={requestPending} onClick={() => decidePlan('reject')}>Reject</button>
            </div>
          </div>
        )}

        {latestRun?.steps.length ? (
          <div className="wk-card"><span className="wk-label">Run steps</span><div className="wk-steps">
            {latestRun.steps.map((step) => (
              <div className="wk-step" key={step.id}><Hammer size={14} /><span className="wk-step-txt"><strong>{step.title}</strong><span>{step.summary ?? step.status.toLowerCase()}</span></span></div>
            ))}
          </div></div>
        ) : null}
      </div>

      {revision?.metrics && (
        <div className="wk-section">
          <h3 className="wk-h2">Measurements</h3>
          <dl className="wk-metrics">
            <div className="wk-metric"><dt>Volume</dt><dd>{revision.metrics.volume?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'} mm³</dd></div>
            <div className="wk-metric"><dt>Surface area</dt><dd>{revision.metrics.surfaceArea?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? '—'} mm²</dd></div>
          </dl>
          <p className="wk-muted">Measured from the built geometry. Manufacturability and fit are not checked.</p>
        </div>
      )}
    </div>
  );

  return (
    <main className="wk">
      <header className="wk-top">
        <a className="wk-back" href="/projects"><ChevronDown size={14} style={{ transform: 'rotate(90deg)' }} aria-hidden="true" />Projects</a>
        <span className="wk-title">
          <h1>{project.title}</h1>
          <span className="wk-vis">{project.visibility === 'PUBLIC' ? 'Published' : 'Private'}</span>
        </span>
        <button type="button" className="wk-chip" onClick={() => { setActiveTab('versions'); setMobileView('panel'); }} title="Open version history">
          <GitBranch size={11} aria-hidden="true" />{revision ? `R${revision.revisionNumber}` : 'no build'}
        </button>
        <div className="wk-top-actions">
          {shareState !== 'idle' && (
            <span className="wk-muted" role="status" aria-live="polite">
              {shareState === 'copied' ? (project.visibility === 'PUBLIC' ? 'Link copied' : 'Private link copied') : shareState === 'shared' ? 'Shared' : shareState === 'published' ? 'Published' : shareState === 'unpublished' ? 'Now private' : 'Share failed'}
            </span>
          )}
          <button type="button" className="wk-btn wk-btn-quiet wk-btn-icon" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button type="button" className="wk-btn" onClick={share}><Share2 size={13} />{project.visibility === 'PUBLIC' ? 'Share' : 'Copy link'}</button>
          {project.visibility === 'PUBLIC'
            ? <button type="button" className="wk-btn" onClick={() => publish(false)} disabled={requestPending}>Make private</button>
            : canPublish && <button type="button" className="wk-btn wk-btn-primary" onClick={() => publish(true)} disabled={requestPending}>Publish R{revision!.revisionNumber}</button>}
        </div>
      </header>

      <nav className="wk-mobile-tabs" aria-label="Workspace view">
        <button type="button" className="wk-tab" aria-selected={mobileView === 'chat'} onClick={() => setMobileView('chat')}>Assistant</button>
        <button type="button" className="wk-tab" aria-selected={mobileView === 'panel'} onClick={() => setMobileView('panel')}>Model</button>
      </nav>

      <div className="wk-body" style={{ '--wk-chat': `${split}%` } as React.CSSProperties}>
        <section className="wk-chat" data-mobile-hidden={mobileView !== 'chat'} aria-label="Assistant">
          <div className="wk-scroll">
            <div className="wk-thread">
              {messages.length === 0 && (
                <div className="wk-welcome">
                  <span className="wk-label">Design workspace</span>
                  <h2>What are you building?</h2>
                  <p>Describe a part to build it, switch to Ask to talk through the design, or Plan first to review the approach before any geometry is made.</p>
                  <div className="wk-starters">
                    <button type="button" className="wk-starter" onClick={() => setPrompt('Create a spur gear with 20 teeth, module 2, a 10 mm bore, and 5 mm thickness.')}><Box size={14} />Create a spur gear</button>
                    <button type="button" className="wk-starter" onClick={() => setPrompt('Create a compact desktop stand with a stable base and cable channel.')}><Box size={14} />Create a desktop stand</button>
                    <button type="button" className="wk-starter" onClick={() => { setMode('ask'); setPrompt('What are the current dimensions, and what was actually verified?'); }}><Check size={14} />Ask what was verified</button>
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <article className={`wk-msg wk-msg-${message.role}`} key={message.id}>
                  <span className="wk-msg-from"><span className="wk-label">{message.role === 'user' ? 'You' : 'CadPilot'}</span></span>
                  {chatThoughts[message.id] && (
                    <details className="wk-card wk-think">
                      <summary className="wk-think-top"><span className="wk-label">Thinking</span></summary>
                      <div className="wk-think-body">{chatThoughts[message.id].split('\n').filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}</div>
                    </details>
                  )}
                  <div className="wk-msg-body"><EngineeringMarkdown>{message.content}</EngineeringMarkdown></div>
                </article>
              ))}

              <AgentMarkers events={feed} busy={busy} />
              {requestPending && conversing && <div className="wk-working" role="status"><span className="wk-zebra" aria-hidden="true" /><span>Thinking…</span></div>}
              <div ref={threadEnd} />
            </div>
          </div>
          <AgentComposer
            value={prompt}
            onChange={setPrompt}
            onSubmit={submit}
            onStop={busy && !requestPending ? cancelRun : undefined}
            busy={busy || requestPending || Boolean(pendingRun)}
            mode={mode}
            onModeChange={setMode}
            revisionLabel={revisionLabel}
            baseIsManual={manualBase}
          />
        </section>

        <button
          className="wk-split"
          type="button"
          aria-label="Resize panels"
          aria-valuenow={Math.round(split)}
          aria-valuemin={22}
          aria-valuemax={62}
          role="separator"
          onPointerDown={startResize}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') { event.preventDefault(); nudgeSplit(-3); }
            if (event.key === 'ArrowRight') { event.preventDefault(); nudgeSplit(3); }
          }}
        />

        <section className="wk-pane" data-mobile-hidden={mobileView !== 'panel'} aria-label="Model and outputs">
          <div className="wk-tabs" role="tablist" aria-label="Workspace panels">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} type="button" role="tab" className="wk-tab" aria-selected={activeTab === tab.id} onClick={() => setActiveTab(tab.id)}>
                  <Icon size={13} aria-hidden="true" />{tab.label}
                </button>
              );
            })}
          </div>

          <div className="wk-tabbody">
            <div className="wk-fill" hidden={activeTab !== 'preview'}>
              <CadWorkbench embedded projectSlug={project.slug} parentRevisionId={revision?.id ?? null} stepText={chiliStep} />
              {stepArtifact && (
                <div className="wk-float">
                  <button type="button" title="Open in the full editor" aria-label="Open in the full editor"
                    onClick={() => { window.localStorage.setItem(HANDOFF_TO_CHILI_NAME, project.title); window.open('/chili-editor', '_blank', 'noopener'); }}><Maximize2 size={14} /></button>
                </div>
              )}
            </div>

            <div className="wk-fill" hidden={activeTab !== 'blueprint'}>
              <DrawingViewer artifacts={revision?.artifacts ?? []} kind="BLUEPRINT_SVG" emptyHint="Build a revision to generate its projected views." />
            </div>
            <div className="wk-fill" hidden={activeTab !== 'sketch'}>
              <DrawingViewer artifacts={revision?.artifacts ?? []} kind="SKETCH_SVG" emptyHint="Build a revision to generate its sketch profiles." />
            </div>

            {activeTab === 'code' && (
              revision?.sourceCode
                ? <pre className="wk-code">{revision.sourceCode}</pre>
                : <div className="wk-empty"><Code2 size={22} /><strong>No source yet</strong><span>Generated Replicad source appears here once a revision is built.</span></div>
            )}

            {activeTab === 'files' && (
              revision?.artifacts.length
                ? <WorkspaceFilePreview artifacts={revision.artifacts} activeId={previewFile} onSelect={(id) => setPreviewFile(id)} />
                : <div className="wk-empty"><Files size={22} /><strong>No files yet</strong><span>Exports, reports, and drawings appear here after a build.</span></div>
            )}

            {activeTab === 'versions' && (
              <div className="wk-pad">
                <VersionPanel
                  projectSlug={project.slug}
                  revisions={project.revisions}
                  selectedId={revision?.id ?? null}
                  publishedId={project.publishedRevisionId}
                  busy={busy || requestPending}
                  onSelect={chooseRevision}
                  onChanged={async () => { try { await refreshProject(); } catch { setErrorMessage('Saved, but the workspace could not refresh. Reload to see the change.'); } }}
                  onError={setErrorMessage}
                />
              </div>
            )}

            {activeTab === 'review' && reviewPanel}
          </div>

          {revision?.artifacts.length ? (
            <div className="wk-draw-top" style={{ boxShadow: '0 -1px 0 0 var(--w-line)' }}>
              <span className="wk-label">Quick open</span>
              {revision.artifacts.slice(0, 4).map((file) => (
                <button key={file.id} type="button" className="wk-chip" onClick={() => openFile(file)}><FileCode2 size={11} />{file.filename}</button>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
