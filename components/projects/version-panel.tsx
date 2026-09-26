'use client';

import { useState } from 'react';
import { Archive, ArchiveRestore, Check, GitCompare, History, Pencil, RotateCcw, X } from 'lucide-react';

type Artifact = { id: string; filename: string; kind: string };
export type PanelRevision = {
  id: string;
  revisionNumber: number;
  parentId?: string | null;
  label?: string | null;
  prompt: string;
  createdAt: string;
  isValid: boolean;
  archivedAt?: string | null;
  metrics?: { volume?: number; surfaceArea?: number } | null;
  artifacts: Artifact[];
};

type Delta = { from: number; to: number; absolute: number; percent: number | null } | null;
type Comparison = {
  a: { revisionNumber: number };
  b: { revisionNumber: number };
  metrics: { volume: Delta; surfaceArea: Delta; triangleCount: Delta; partCount: Delta };
  validation: { valid: { from: boolean; to: boolean; changed: boolean }; warningsAdded: string[]; warningsResolved: string[] };
  artifacts: { onlyInA: string[]; onlyInB: string[] };
  lineage: { aIsAncestorOfB: boolean; bIsAncestorOfA: boolean; distance: number | null };
  source: { changed: boolean; lineDelta: number };
};

const fmt = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

function DeltaRow({ label, delta, unit }: { label: string; delta: Delta; unit?: string }) {
  if (!delta) return <div className="wk-diff-row"><span>{label}</span><span className="wk-muted">not measured on both</span></div>;
  const rising = delta.absolute > 0;
  const flat = delta.absolute === 0;
  return (
    <div className="wk-diff-row">
      <span>{label}</span>
      <span className={flat ? undefined : rising ? 'wk-up' : 'wk-down'}>
        {fmt(delta.from)} → {fmt(delta.to)}{unit ? ` ${unit}` : ''}
        {!flat && ` (${rising ? '+' : ''}${fmt(delta.absolute)}${delta.percent === null ? '' : `, ${rising ? '+' : ''}${delta.percent}%`})`}
      </span>
    </div>
  );
}

export function VersionPanel({
  projectSlug, revisions, selectedId, publishedId, busy, onSelect, onChanged, onError,
}: {
  projectSlug: string;
  revisions: PanelRevision[];
  selectedId: string | null;
  publishedId?: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void> | void;
  onError: (message: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = revisions.filter((item) => showArchived || !item.archivedAt);

  const call = async (id: string, url: string, init: RequestInit, failure: string) => {
    if (pending) return;
    setPending(id);
    try {
      const response = await fetch(url, init);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? failure);
      await onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : failure);
    } finally { setPending(null); }
  };

  const saveLabel = (revision: PanelRevision) => {
    const label = draftLabel.trim();
    setRenaming(null);
    if (label === (revision.label ?? '')) return;
    void call(revision.id, `/api/projects/${projectSlug}/revisions/${revision.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label || null }),
    }, 'Unable to rename this revision.');
  };

  const compare = async (id: string) => {
    if (!selectedId || selectedId === id) return;
    setCompareWith(id);
    setComparison(null);
    try {
      const response = await fetch(`/api/projects/${projectSlug}/revisions/compare?a=${id}&b=${selectedId}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? 'Unable to compare these revisions.');
      setComparison(data as Comparison);
    } catch (error) {
      setCompareWith(null);
      onError(error instanceof Error ? error.message : 'Unable to compare these revisions.');
    }
  };

  return (
    <div className="wk-vers">
      <div className="wk-vers-head">
        <h3 className="wk-h2">Versions</h3>
        <button type="button" className="wk-btn wk-btn-quiet" onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      </div>

      {visible.length === 0 && <p className="wk-muted">No revisions yet. Build something to start the history.</p>}

      {visible.map((revision) => {
        const active = revision.id === selectedId;
        const isPublished = revision.id === publishedId;
        const working = pending === revision.id;
        return (
          <div key={revision.id} className={`wk-ver${active ? ' wk-ver-active' : ''}${revision.archivedAt ? ' wk-ver-archived' : ''}`}>
            <span className="wk-ver-n">R{revision.revisionNumber}</span>
            <span className="wk-ver-txt">
              {renaming === revision.id ? (
                <input
                  className="wk-ver-rename"
                  autoFocus
                  value={draftLabel}
                  maxLength={80}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  onBlur={() => saveLabel(revision)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); saveLabel(revision); }
                    if (event.key === 'Escape') setRenaming(null);
                  }}
                  aria-label={`Name for revision ${revision.revisionNumber}`}
                />
              ) : (
                <strong>{revision.label || revision.prompt || 'Untitled revision'}</strong>
              )}
              <small>
                {new Date(revision.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                {!revision.isValid && ' · incomplete'}
                {isPublished && ' · published'}
                {revision.archivedAt && ' · archived'}
              </small>
            </span>
            <span className="wk-ver-acts">
              {revision.isValid && !revision.archivedAt && !active && (
                <button type="button" className="wk-btn wk-btn-quiet" disabled={busy || working} onClick={() => onSelect(revision.id)}>Use</button>
              )}
              {active && <span className="wk-chip wk-chip-accent"><Check size={11} aria-hidden="true" /> base</span>}
              <button type="button" className="wk-btn wk-btn-quiet wk-btn-icon" title="Rename" aria-label={`Rename revision ${revision.revisionNumber}`}
                disabled={working} onClick={() => { setRenaming(revision.id); setDraftLabel(revision.label ?? ''); }}><Pencil size={13} /></button>
              {selectedId && selectedId !== revision.id && (
                <button type="button" className="wk-btn wk-btn-quiet wk-btn-icon" title="Compare with current base" aria-label={`Compare revision ${revision.revisionNumber} with the current base`}
                  disabled={working} onClick={() => void compare(revision.id)}><GitCompare size={13} /></button>
              )}
              {revision.isValid && (
                <button type="button" className="wk-btn wk-btn-quiet wk-btn-icon" title="Restore as a new revision" aria-label={`Restore revision ${revision.revisionNumber} as a new revision`}
                  disabled={busy || working} onClick={() => void call(revision.id, `/api/projects/${projectSlug}/revisions/${revision.id}/restore`, { method: 'POST' }, 'Unable to restore this revision.')}><RotateCcw size={13} /></button>
              )}
              {revision.archivedAt ? (
                <button type="button" className="wk-btn wk-btn-quiet wk-btn-icon" title="Unarchive" aria-label={`Unarchive revision ${revision.revisionNumber}`}
                  disabled={working} onClick={() => void call(revision.id, `/api/projects/${projectSlug}/revisions/${revision.id}/archive`, { method: 'DELETE' }, 'Unable to unarchive this revision.')}><ArchiveRestore size={13} /></button>
              ) : (
                <button type="button" className="wk-btn wk-btn-quiet wk-btn-icon wk-btn-danger" title="Archive" aria-label={`Archive revision ${revision.revisionNumber}`}
                  disabled={working || isPublished} onClick={() => void call(revision.id, `/api/projects/${projectSlug}/revisions/${revision.id}/archive`, { method: 'POST' }, 'Unable to archive this revision.')}><Archive size={13} /></button>
              )}
            </span>
          </div>
        );
      })}

      {comparison && (
        <div className="wk-diff">
          <div className="wk-vers-head">
            <span className="wk-label"><History size={11} aria-hidden="true" /> R{comparison.a.revisionNumber} → R{comparison.b.revisionNumber}</span>
            <button type="button" className="wk-btn wk-btn-quiet wk-btn-icon" aria-label="Close comparison" onClick={() => { setComparison(null); setCompareWith(null); }}><X size={13} /></button>
          </div>
          <DeltaRow label="Volume" delta={comparison.metrics.volume} unit="mm³" />
          <DeltaRow label="Surface area" delta={comparison.metrics.surfaceArea} unit="mm²" />
          <DeltaRow label="Parts" delta={comparison.metrics.partCount} />
          <DeltaRow label="Triangles" delta={comparison.metrics.triangleCount} />
          <div className="wk-diff-row"><span>Source</span><span>{comparison.source.changed ? `changed (${comparison.source.lineDelta >= 0 ? '+' : ''}${comparison.source.lineDelta} lines)` : 'identical'}</span></div>
          {comparison.validation.valid.changed && <div className="wk-diff-row"><span>Validity</span><span>{String(comparison.validation.valid.from)} → {String(comparison.validation.valid.to)}</span></div>}
          {comparison.validation.warningsAdded.length > 0 && <div className="wk-diff-row"><span>New warnings</span><span className="wk-down">{comparison.validation.warningsAdded.length}</span></div>}
          {comparison.validation.warningsResolved.length > 0 && <div className="wk-diff-row"><span>Resolved warnings</span><span className="wk-up">{comparison.validation.warningsResolved.length}</span></div>}
          {(comparison.artifacts.onlyInA.length > 0 || comparison.artifacts.onlyInB.length > 0) && (
            <div className="wk-diff-row"><span>Outputs</span><span>{comparison.artifacts.onlyInB.length} added · {comparison.artifacts.onlyInA.length} removed</span></div>
          )}
          <div className="wk-diff-row">
            <span>Lineage</span>
            <span>{comparison.lineage.aIsAncestorOfB || comparison.lineage.bIsAncestorOfA
              ? `direct ancestry${comparison.lineage.distance ? ` · ${comparison.lineage.distance} step${comparison.lineage.distance === 1 ? '' : 's'}` : ''}`
              : 'separate branches'}</span>
          </div>
        </div>
      )}
      {compareWith && !comparison && <p className="wk-muted">Comparing…</p>}
    </div>
  );
}
