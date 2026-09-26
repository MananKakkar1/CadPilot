'use client';

import { useState } from 'react';
import { AlertTriangle, Brain, CheckCircle2, ChevronRight, FileCode2, Hammer, PencilRuler, Target, Wrench, XCircle } from 'lucide-react';

type TimelineEvent = { id: string; stage: string; agent: string; tool?: string | null; summary: string; detail?: Record<string, unknown> | null; createdAt: string };

type PlanDetail = {
  decision?: string;
  features?: Array<{ name?: string; operation?: string; parameters?: Record<string, unknown> }>;
  dimensions?: Record<string, number>;
  constraints?: string[];
};

type ValidationDetail = { valid?: boolean; complete?: boolean; warnings?: string[]; score?: number; findings?: string[] };
type EvaluateDetail = { metrics?: Record<string, unknown>; validation?: ValidationDetail };

// generate/repair/preview.ready/drawing are sequential sub-steps of one build attempt,
// so consecutive events of these stages collapse into a single compact timeline card.
const OPERATION_STAGES = new Set(['generate', 'repair', 'preview.ready', 'drawing']);

type Group =
  | { kind: 'thinking'; event: TimelineEvent }
  | { kind: 'intent'; event: TimelineEvent }
  | { kind: 'plan'; event: TimelineEvent }
  | { kind: 'operation'; events: TimelineEvent[] }
  | { kind: 'evaluate'; event: TimelineEvent }
  | { kind: 'failed'; event: TimelineEvent }
  | { kind: 'generic'; event: TimelineEvent };

function groupEvents(events: TimelineEvent[]): Group[] {
  const groups: Group[] = [];
  for (const event of events) {
    if (event.stage === 'thinking') { groups.push({ kind: 'thinking', event }); continue; }
    if (event.stage === 'intent') { groups.push({ kind: 'intent', event }); continue; }
    if (event.stage === 'plan') { groups.push({ kind: 'plan', event }); continue; }
    if (event.stage === 'evaluate') { groups.push({ kind: 'evaluate', event }); continue; }
    if (event.stage === 'failed') { groups.push({ kind: 'failed', event }); continue; }
    if (OPERATION_STAGES.has(event.stage)) {
      const last = groups[groups.length - 1];
      if (last && last.kind === 'operation') { last.events.push(event); continue; }
      groups.push({ kind: 'operation', events: [event] });
      continue;
    }
    // Unknown/future stage: fall back to a plain step so new worker stages never
    // crash or silently disappear from the feed.
    groups.push({ kind: 'generic', event });
  }
  return groups;
}

const operationIcon = (stage: string) =>
  stage === 'generate' ? FileCode2 : stage === 'repair' ? Wrench : stage === 'drawing' ? PencilRuler : Hammer;

function Step({ event, icon: Icon }: { event: TimelineEvent; icon: typeof Hammer }) {
  return (
    <div className="wk-step">
      <Icon size={14} aria-hidden="true" />
      <span className="wk-step-txt">
        <strong>{event.summary}</strong>
        <span>{event.agent}{event.tool ? ` · ${event.tool}` : ''}</span>
      </span>
    </div>
  );
}

function OperationTimeline({ events }: { events: TimelineEvent[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleCount = 4;
  const hidden = events.length - visibleCount;
  const shown = expanded || hidden <= 0 ? events : events.slice(-visibleCount);
  return (
    <div className="wk-card">
      <span className="wk-label">Build steps</span>
      {hidden > 0 && !expanded && (
        <button type="button" className="wk-more" onClick={() => setExpanded(true)}>
          Show {hidden} earlier step{hidden === 1 ? '' : 's'}
        </button>
      )}
      <div className="wk-steps">
        {shown.map((event) => <Step key={event.id} event={event} icon={operationIcon(event.stage)} />)}
      </div>
    </div>
  );
}

/** The model's own reasoning summary. Collapsed by default: it is context, not the result. */
function ThinkingCard({ event }: { event: TimelineEvent }) {
  const [open, setOpen] = useState(false);
  const detail = (event.detail ?? null) as { model?: string; phase?: string } | null;
  const lines = event.summary.split('\n').filter((line) => line.trim());
  const preview = lines[0] ?? '';
  return (
    <div className="wk-card wk-think">
      <button type="button" className="wk-think-top" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <ChevronRight size={13} className={open ? 'wk-think-caret wk-think-caret-open' : 'wk-think-caret'} aria-hidden="true" />
        <span className="wk-label"><Brain size={11} aria-hidden="true" /> Thinking</span>
        <span className="wk-think-meta">{detail?.phase ?? event.agent}{lines.length > 1 ? ` · ${lines.length} notes` : ''}</span>
      </button>
      {open
        ? <div className="wk-think-body">{lines.map((line, index) => <p key={index}>{line}</p>)}</div>
        : preview && <p className="wk-think-peek">{preview}</p>}
    </div>
  );
}

function IntentCard({ event }: { event: TimelineEvent }) {
  return (
    <div className="wk-card">
      <span className="wk-card-head"><span className="wk-label"><Target size={11} aria-hidden="true" /> Intent</span></span>
      <p>{event.summary}</p>
    </div>
  );
}

function PlanCard({ event }: { event: TimelineEvent }) {
  const detail = (event.detail ?? null) as PlanDetail | null;
  const features = Array.isArray(detail?.features) ? detail.features : null;
  const dimensions = detail?.dimensions && typeof detail.dimensions === 'object' ? Object.entries(detail.dimensions) : null;
  const constraints = Array.isArray(detail?.constraints) ? detail.constraints : null;
  const hasStructured = Boolean(features?.length || dimensions?.length || constraints?.length);
  return (
    <div className="wk-card">
      <span className="wk-label">Plan</span>
      <p>{event.summary}</p>
      {hasStructured && (
        <div className="wk-kv">
          {dimensions && dimensions.length > 0 && (
            <div><h4>Dimensions</h4><ul>{dimensions.map(([key, value]) => <li key={key}>{key} {String(value)}</li>)}</ul></div>
          )}
          {features && features.length > 0 && (
            <div><h4>Features</h4><ul>{features.map((feature, index) => <li key={feature.name ?? feature.operation ?? index}>{feature.name ?? feature.operation ?? 'feature'}</li>)}</ul></div>
          )}
          {constraints && constraints.length > 0 && (
            <div><h4>Constraints</h4><ul>{constraints.map((item) => <li key={item}>{item}</li>)}</ul></div>
          )}
        </div>
      )}
    </div>
  );
}

function ValidationCard({ event }: { event: TimelineEvent }) {
  const detail = (event.detail ?? null) as EvaluateDetail | null;
  const validation = detail?.validation ?? null;
  if (!validation) return <div className="wk-card"><div className="wk-steps"><Step event={event} icon={Hammer} /></div></div>;
  const warnings = Array.isArray(validation.warnings) ? validation.warnings : [];
  const findings = Array.isArray(validation.findings) ? validation.findings : [];
  // `findings` is built as [...informational lines, ...warnings], so the warnings
  // tail separates pass/fail information from actual problems.
  const infoFindings = findings.slice(0, Math.max(0, findings.length - warnings.length));
  const state = validation.valid === false ? 'bad' : warnings.length > 0 ? 'warn' : validation.complete ? 'good' : 'warn';
  const Icon = state === 'good' ? CheckCircle2 : state === 'warn' ? AlertTriangle : XCircle;
  const headline = state === 'good' ? 'Complete, no warnings'
    : state === 'bad' ? 'Build did not produce valid geometry'
    : validation.valid ? 'Valid, with export warnings' : 'Validation incomplete';
  return (
    <div className={`wk-card wk-check wk-check-${state}`}>
      <span className="wk-card-head"><span className="wk-label"><Icon size={11} aria-hidden="true" /> Checks</span></span>
      <strong>{headline}</strong>
      {infoFindings.length > 0 && <ul className="wk-list">{infoFindings.map((item, i) => <li key={i}>{item}</li>)}</ul>}
      {warnings.length > 0 && <ul className="wk-list wk-list-warn">{warnings.map((item, i) => <li key={i}>{item}</li>)}</ul>}
      {typeof validation.score === 'number' && <span className="wk-label">Score {validation.score}</span>}
    </div>
  );
}

function FailedCard({ event }: { event: TimelineEvent }) {
  const detail = event.detail as { message?: string } | null | undefined;
  return (
    <div className="wk-alert" role="alert">
      <XCircle size={14} aria-hidden="true" />
      <span><strong>Build failed.</strong> {detail?.message ?? event.summary}</span>
    </div>
  );
}

export function AgentMarkers({ events, busy }: { events: TimelineEvent[]; busy: boolean }) {
  if (!busy && events.length === 0) return null;
  const groups = groupEvents(events.slice(-40));
  return (
    <div className="wk-feed" aria-live="polite" aria-label="Agent activity">
      {groups.map((group) => {
        if (group.kind === 'thinking') return <ThinkingCard key={group.event.id} event={group.event} />;
        if (group.kind === 'intent') return <IntentCard key={group.event.id} event={group.event} />;
        if (group.kind === 'plan') return <PlanCard key={group.event.id} event={group.event} />;
        if (group.kind === 'operation') return <OperationTimeline key={group.events[0].id} events={group.events} />;
        if (group.kind === 'evaluate') return <ValidationCard key={group.event.id} event={group.event} />;
        if (group.kind === 'failed') return <FailedCard key={group.event.id} event={group.event} />;
        return <div className="wk-card" key={group.event.id}><div className="wk-steps"><Step event={group.event} icon={Hammer} /></div></div>;
      })}
      {busy && (
        <div className="wk-working" role="status">
          <span className="wk-zebra" aria-hidden="true" />
          <span>Working…</span>
        </div>
      )}
    </div>
  );
}
