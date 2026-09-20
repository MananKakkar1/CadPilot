'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/magicui/button';
import { HANDOFF_TO_CHILI_NAME, HANDOFF_TO_CHILI_STEP } from './cad-handoff';

type BridgeMessage =
  | { source: 'chili3d-bridge'; type: 'ready' }
  | { source: 'chili3d-bridge'; type: 'importing' }
  | { source: 'chili3d-bridge'; type: 'import-done' }
  | { source: 'chili3d-bridge'; type: 'export-step'; step: string; name?: string };

type Status = 'loading' | 'importing' | 'ready' | 'saving' | 'saved' | 'error';

export function ChiliEditor({ projectSlug, parentRevisionId, embedded = false, stepText = null, onSaved }: { projectSlug: string | null; parentRevisionId: string | null; embedded?: boolean; stepText?: string | null; onSaved?: () => void | Promise<void> }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [savedRevisionNumber, setSavedRevisionNumber] = useState<number | null>(null);
  // Starts empty so the first client render matches the server (no window) — set after
  // mount to avoid a hydration mismatch, then used to build the iframe's src.
  const [pluginUrl, setPluginUrl] = useState('');

  useEffect(() => {
    setPluginUrl(`${window.location.origin}/chili3d-bridge/plugins/agentic-cad-bridge/`);
  }, []);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent<BridgeMessage>) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== 'chili3d-bridge') return;

      if (data.type === 'ready') {
        const step = stepText ?? window.localStorage.getItem(HANDOFF_TO_CHILI_STEP);
        const name = window.localStorage.getItem(HANDOFF_TO_CHILI_NAME) ?? 'model';
        if (step && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({ source: 'agentic-cad', type: 'import-step', step, name }, window.location.origin);
          if (!stepText) window.localStorage.removeItem(HANDOFF_TO_CHILI_STEP);
          window.localStorage.removeItem(HANDOFF_TO_CHILI_NAME);
        } else {
          setStatus('ready');
        }
        return;
      }

      if (data.type === 'importing') {
        setStatus('importing');
        return;
      }

      if (data.type === 'import-done') {
        setStatus('ready');
        return;
      }

      if (data.type === 'export-step') {
        if (!projectSlug) {
          setStatus('error');
          setErrorMessage('This editor was opened without a project to save back to.');
          return;
        }
        setStatus('saving');
        try {
          const savePath = parentRevisionId
            ? `/api/projects/${projectSlug}/revisions/${parentRevisionId}/viewport-save`
            : `/api/projects/${projectSlug}/chili-import`;
          const response = await fetch(savePath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ step: data.step, parentRevisionId }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? 'Could not save this revision.');
          setSavedRevisionNumber(body.revision.revisionNumber);
          setStatus('saved');
          await onSaved?.();
          window.dispatchEvent(new CustomEvent('cadpilot:revision-saved', { detail: body.revision }));
        } catch (error) {
          setStatus('error');
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSaved, projectSlug, parentRevisionId, stepText]);

  const statusMessage: Record<Status, string> = {
    loading: 'Loading the ChiliCAD editor… large WASM bundle, first load can take a moment.',
    importing: 'Importing your model into ChiliCAD… detailed geometry (threads, fillets) can take a while to parse.',
    ready: 'Ready. Edit the model, then use the Agentic CAD tab to save it back to this project.',
    saving: 'Saving your edit as a new revision…',
    saved: `Saved as revision ${savedRevisionNumber}.`,
    error: errorMessage || 'Something went wrong.',
  };

  return (
    <div className={`chili-editor-grid ${embedded ? 'chili-editor-grid-embedded' : ''}`}>
      {!embedded && <aside className="chili-editor-panel">
        <p className="chili-editor-eyebrow">CHILICAD EDITOR</p>
        <h1>Full parametric<br />editing, live.</h1>
        <p className="chili-editor-lede">
          The model was handed off as STEP into ChiliCAD, a browser-based parametric CAD editor. Edit the
          sketch, features, or history directly, then send it back to save it as a new revision.
        </p>
        <div className={`chili-editor-status chili-editor-status-${status}`}>
          <i className={`chili-editor-dot ${status === 'loading' || status === 'importing' || status === 'saving' ? 'chili-editor-dot-busy' : ''}`} />
          {statusMessage[status]}
        </div>
        {status === 'saved' && projectSlug && (
          <Button onClick={() => { window.location.href = `/projects/${projectSlug}`; }}>
            Back to project <span>→</span>
          </Button>
        )}
      </aside>}
      <section className="chili-editor-viewport" aria-label="ChiliCAD editor">
        {pluginUrl && (
          <iframe
            ref={iframeRef}
            className="chili-editor-iframe"
            src={`/chili3d/index.html?plugin=${encodeURIComponent(pluginUrl)}`}
            title="ChiliCAD editor"
            allow="fullscreen"
          />
        )}
        {(status === 'loading' || status === 'importing') && (
          <div className="chili-editor-loading">
            <i className="chili-editor-dot chili-editor-dot-busy" />
            {status === 'loading' ? 'Loading ChiliCAD…' : 'Importing model…'}
          </div>
        )}
      </section>
    </div>
  );
}
