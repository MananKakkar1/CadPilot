'use client';

import { useEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowUp, ChevronDown, Square } from 'lucide-react';

export type AgentMode = 'ask' | 'build' | 'plan';

type AgentComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  busy: boolean;
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  revisionLabel?: string;
  baseIsManual?: boolean;
};

const MODE_COPY: Record<AgentMode, string> = {
  ask: 'Answers questions about this design. Builds nothing.',
  build: 'Builds geometry directly from the request.',
  plan: 'Returns a plan to approve before any geometry is built.',
};

const MODE_LABEL: Record<AgentMode, string> = { ask: 'Ask', build: 'Build', plan: 'Plan first' };

export function AgentComposer({ value, onChange, onSubmit, onStop, busy, mode, onModeChange, revisionLabel, baseIsManual }: AgentComposerProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  // Grow with content up to the CSS max-height, then scroll.
  useEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  const send = () => { if (!busy && value.trim()) onSubmit(); };
  const submit = (event: FormEvent) => { event.preventDefault(); send(); };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
  };

  return (
    <form className="wk-composer" onSubmit={submit}>
      <div className="wk-composer-chips">
        {revisionLabel && <span className="wk-chip">{revisionLabel}</span>}
        <span className={`wk-chip${mode === 'build' ? '' : ' wk-chip-accent'}`}>{MODE_LABEL[mode]}</span>
        {baseIsManual && <span className="wk-chip">Manual base</span>}
      </div>
      <div className="wk-shell">
        <textarea
          ref={textarea}
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={mode === 'ask' ? 'Ask about dimensions, checks, or what to change…' : 'Describe the part, a dimension change, or a feature to add…'}
          aria-label="Design request"
          aria-describedby="wk-mode-help"
          disabled={busy}
        />
        <div className="wk-bar">
          <label className="wk-select">
            <span className="sr-only">Agent mode</span>
            <select value={mode} onChange={(event) => onModeChange(event.target.value as AgentMode)} disabled={busy}>
              <option value="ask">Ask</option>
              <option value="build">Build</option>
              <option value="plan">Plan first</option>
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </label>
          <span className="wk-hint" id="wk-mode-help">{busy ? 'Running…' : MODE_COPY[mode]}</span>
          {busy && onStop ? (
            <button type="button" className="wk-send" onClick={onStop} aria-label="Stop this run"><Square size={13} /></button>
          ) : (
            <button type="submit" className="wk-send" disabled={busy || !value.trim()} aria-label={mode === 'ask' ? 'Send question' : mode === 'plan' ? 'Create plan' : 'Build revision'}><ArrowUp size={15} /></button>
          )}
        </div>
      </div>
    </form>
  );
}
