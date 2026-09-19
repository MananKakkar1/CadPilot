'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/magicui/button';
import { Badge } from '@/components/magicui/badge';
import { HANDOFF_FROM_CHILI_NAME, HANDOFF_FROM_CHILI_STEP, HANDOFF_TO_CHILI_NAME, HANDOFF_TO_CHILI_STEP } from './cad-handoff';

type BridgeMessage =
  | { source: 'chili3d-bridge'; type: 'ready' }
  | { source: 'chili3d-bridge'; type: 'importing' }
  | { source: 'chili3d-bridge'; type: 'import-done' }
  | { source: 'chili3d-bridge'; type: 'export-step'; step: string; name?: string };

type Status = 'loading' | 'importing' | 'ready' | 'captured';

export function ChiliEditor() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  // Starts empty so the first client render matches the server (no window) — set after
  // mount to avoid a hydration mismatch, then used to build the iframe's src.
  const [pluginUrl, setPluginUrl] = useState('');

  useEffect(() => {
    setPluginUrl(`${window.location.origin}/chili3d-bridge/plugins/agentic-cad-bridge/`);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<BridgeMessage>) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.source !== 'chili3d-bridge') return;

      if (data.type === 'ready') {
        const step = window.localStorage.getItem(HANDOFF_TO_CHILI_STEP);
        const name = window.localStorage.getItem(HANDOFF_TO_CHILI_NAME) ?? 'model';
        if (step && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({ source: 'agentic-cad', type: 'import-step', step, name }, window.location.origin);
          window.localStorage.removeItem(HANDOFF_TO_CHILI_STEP);
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
        window.localStorage.setItem(HANDOFF_FROM_CHILI_STEP, data.step);
        window.localStorage.setItem(HANDOFF_FROM_CHILI_NAME, data.name ?? 'model-from-chilicad');
        setStatus('captured');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const statusMessage: Record<Status, string> = {
    loading: 'Loading the ChiliCAD editor… large WASM bundle, first load can take a moment.',
    importing: 'Importing your model into ChiliCAD… detailed geometry (threads, fillets) can take a while to parse.',
    ready: 'Ready. Edit the model, then use the Agentic CAD tab to send it back.',
    captured: 'Model captured from ChiliCAD.',
  };

  return (
    <div className="ai-cad-studio">
      <aside className="ai-cad-panel">
        <Badge>CHILICAD EDITOR</Badge>
        <h1>Full parametric<br /><em>editing, live.</em></h1>
        <p className="lede">
          The model was handed off as STEP into ChiliCAD, a browser-based parametric CAD editor. Edit the
          sketch, features, or history directly, then send it back when you&apos;re done.
        </p>
        <div className="ai-cad-status">
          <i className={`status-dot ${status === 'loading' || status === 'importing' ? 'status-dot-busy' : ''}`} />
          {statusMessage[status]}
        </div>
        {status === 'captured' && (
          <Button onClick={() => { window.location.href = '/ai?fromChili=1'; }}>
            Open in AI CAD Studio <span>→</span>
          </Button>
        )}
      </aside>
      <section className="ai-cad-viewport" aria-label="ChiliCAD editor">
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
            <i className="status-dot status-dot-busy" />
            {status === 'loading' ? 'Loading ChiliCAD…' : 'Importing model…'}
          </div>
        )}
      </section>
    </div>
  );
}
