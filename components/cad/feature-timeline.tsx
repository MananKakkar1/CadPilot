'use client';

import { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';

export type FeatureParameter = { key: string; display?: string; value: unknown; unit?: string };
export type FeatureItem = {
  id: string;
  name?: string;
  display?: string;
  suppressed?: boolean;
  error?: string;
  warning?: string;
  parameters: FeatureParameter[];
};
export type FeatureList = { nodeId: string; rollbackIndex?: number; features: FeatureItem[] };

/**
 * Horizontal, Fusion/Onshape-style feature timeline. This is a thin view over Chili3D's own
 * native parametric feature history (`node.featureItems()`, `node.rollbackIndex`,
 * `node.setFeaturesEmitShapeChanged`) — see main.js's bridge handlers. It holds no feature
 * data of its own; every action here round-trips through the engine, which remains the
 * single source of truth (the same document also drives the native `chili-feature-list`
 * panel, so both views always agree).
 */
export function FeatureTimeline({ list, ready, onSetRollback, onToggleSuppressed, onSetParameter }: {
  list: FeatureList | null;
  ready: boolean;
  onSetRollback: (index: number | undefined) => void;
  onToggleSuppressed: (id: string, suppressed: boolean) => void;
  onSetParameter: (id: string, key: string, value: string | number | boolean) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!list || list.features.length === 0) return null;
  const { features, rollbackIndex } = list;
  const activeUpTo = rollbackIndex ?? features.length;
  const editing = editingId ? features.find((f) => f.id === editingId) : null;

  return (
    <div className="cad-feature-timeline" role="group" aria-label="Feature timeline">
      <div className="cad-feature-timeline-track">
        {features.map((feature, index) => {
          const rolledBack = index >= activeUpTo;
          const label = feature.name || feature.display || `Feature ${index + 1}`;
          return (
            <button
              key={feature.id}
              type="button"
              className="cad-feature-chip"
              data-suppressed={feature.suppressed || rolledBack ? 'true' : undefined}
              data-error={feature.error ? 'true' : undefined}
              disabled={!ready}
              title={feature.error ? `${label}: ${feature.error}` : feature.warning ? `${label}: ${feature.warning}` : label}
              aria-pressed={!rolledBack && !feature.suppressed}
              onClick={() => onSetRollback(index + 1 === features.length ? undefined : index + 1)}
              onDoubleClick={() => setEditingId(feature.id)}
              onContextMenu={(event) => { event.preventDefault(); onToggleSuppressed(feature.id, !feature.suppressed); }}
            >
              {feature.error && <AlertTriangle size={11} aria-hidden="true" />}
              <span>{label}</span>
            </button>
          );
        })}
        {rollbackIndex !== undefined && rollbackIndex < features.length && (
          <button type="button" className="cad-feature-chip cad-feature-chip-end" disabled={!ready} onClick={() => onSetRollback(undefined)}>
            <Check size={11} aria-hidden="true" /><span>Latest</span>
          </button>
        )}
      </div>
      {editing && (
        <div className="cad-feature-edit" role="dialog" aria-label={`Edit ${editing.name ?? editing.display ?? 'feature'} parameters`}>
          <div className="cad-feature-edit-head">
            <strong>{editing.name || editing.display}</strong>
            <button type="button" onClick={() => setEditingId(null)} aria-label="Close">×</button>
          </div>
          {editing.parameters.length === 0 && <p className="cad-feature-edit-empty">This feature has no editable parameters.</p>}
          {editing.parameters.map((param) => (
            <label key={param.key} className="cad-feature-param">
              <span>{param.display || param.key}{param.unit ? ` (${param.unit})` : ''}</span>
              {typeof param.value === 'boolean' ? (
                <input type="checkbox" checked={param.value} disabled={!ready}
                  onChange={(event) => onSetParameter(editing.id, param.key, event.target.checked)} />
              ) : typeof param.value === 'number' ? (
                <input type="number" defaultValue={param.value} disabled={!ready}
                  onBlur={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onSetParameter(editing.id, param.key, next); }} />
              ) : (
                <input type="text" defaultValue={String(param.value ?? '')} disabled={!ready}
                  onBlur={(event) => onSetParameter(editing.id, param.key, event.target.value)} />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
