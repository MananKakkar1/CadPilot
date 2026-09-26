'use client';
import { useEffect, useRef, useState } from 'react';
import { ViewportTools, type CadCommand } from './viewport-tools';
import { HANDOFF_TO_CHILI_NAME, HANDOFF_TO_CHILI_STEP } from './cad-handoff';
import { FeatureTimeline, type FeatureList } from './feature-timeline';

// Chili3D's own navigation profiles (confirmed against the pinned upstream source,
// packages/core/src/navigation.ts): each name drives mouse orbit/pan/zoom bindings, wheel
// zoom direction, AND keyboard shortcuts together — one setting covers navigation and
// shortcut presets both, there's no separate keymap to wire up.
export const NAV_PRESETS = ['Chili3d', 'Revit', 'Blender', 'Creo', 'Solidworks'] as const;
export type NavPreset = (typeof NAV_PRESETS)[number];

export type WorkbenchState = { activeCommand: string | null; canCancel: boolean; selectedCount: number; navPreset?: NavPreset };

type BridgeMessage =
  | { source: 'chili3d-bridge'; type: 'workbench-state'; state: WorkbenchState }
  | { source: 'chili3d-bridge'; type: 'error'; message: string }
  | { source: 'chili3d-bridge'; type: 'ready' }
  | { source: 'chili3d-bridge'; type: 'importing' }
  | { source: 'chili3d-bridge'; type: 'import-done' }
  | { source: 'chili3d-bridge'; type: 'preview-ready' }
  | { source: 'chili3d-bridge'; type: 'commands'; commands: CadCommand[] }
  | { source: 'chili3d-bridge'; type: 'feature-list'; list: FeatureList | null }
  | { source: 'chili3d-bridge'; type: 'export-step'; step: string; name?: string };

type Status = 'loading' | 'importing' | 'ready' | 'saving' | 'saved' | 'error';

export function CadWorkbench({ projectSlug, parentRevisionId, embedded = false, stepText = null, onSaved }: { projectSlug: string | null; parentRevisionId: string | null; embedded?: boolean; stepText?: string | null; onSaved?: () => void | Promise<void> }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const workbenchRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [savedRevisionNumber, setSavedRevisionNumber] = useState<number | null>(null);
  // Starts empty so the first client render matches the server (no window) — set after
  // mount to avoid a hydration mismatch, then used to build the iframe's src.
  const [pluginUrl, setPluginUrl] = useState('');
  const [preview, setPreview] = useState<unknown>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [commands, setCommands] = useState<CadCommand[]>([]);
  // Native tree/property sidebar starts open: persistent chrome by default (matches
  // Fusion/SolidWorks/Onshape's always-present panels), not a closed-by-default flyout.
  const [panels, setPanels] = useState(true);
  const [engineState, setEngineState] = useState<WorkbenchState>({ activeCommand: null, canCancel: false, selectedCount: 0 });
  const [featureList, setFeatureList] = useState<FeatureList | null>(null);

  useEffect(() => {
    setPluginUrl(`${window.location.origin}/chili3d-bridge/plugins/agentic-cad-bridge/`);
  }, []);

  // The engine has its own document: resolve the workspace tokens here instead
  // of duplicating the app's light/dark palettes in its bundled stylesheets.
  useEffect(() => {
    if (!bridgeReady) return;
    const syncTheme = () => {
      if (!workbenchRef.current) return;
      const style = getComputedStyle(workbenchRef.current);
      const tokens = Object.fromEntries(
        ['surface', 'subtle', 'canvas', 'text', 'muted', 'border', 'hover', 'selected', 'focus', 'danger', 'font']
          .map(name => [`--cad-${name}`, style.getPropertyValue(`--cad-${name}`).trim()]),
      );
      iframeRef.current?.contentWindow?.postMessage({ source: 'agentic-cad', type: 'set-theme', tokens }, window.location.origin);
    };
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', syncTheme);
    return () => { observer.disconnect(); media.removeEventListener('change', syncTheme); };
  }, [bridgeReady]);

  useEffect(() => {
    if (!projectSlug) return;
    fetch(`/api/projects/${projectSlug}`, { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((data) => {
      const selectedRevision = parentRevisionId
        ? data?.project?.revisions?.find((item: { id?: string }) => item.id === parentRevisionId)
        : data?.project?.revisions?.[0];
      const artifact = selectedRevision?.artifacts?.find((item: { kind?: string }) => item.kind === 'PREVIEW_MESH');
      if (!artifact) return;
      return fetch(`/api/artifacts/${artifact.id}?inline=1`).then((response) => response.ok ? response.json() : null).then(setPreview);
    }).catch(() => undefined);
  }, [projectSlug, parentRevisionId]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent<BridgeMessage>) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== 'chili3d-bridge') return;

      if (data.type === 'workbench-state') { setEngineState(data.state); return; }
      if (data.type === 'error') { setErrorMessage(data.message); setStatus('error'); return; }
      if (data.type === 'commands') {
        setCommands(data.commands.filter((command) => !/^(?:wechat|ai)\./i.test(command.key)));
        return;
      }
      if (data.type === 'feature-list') { setFeatureList(data.list); return; }

      if (data.type === 'ready') {
        setBridgeReady(true);
        iframeRef.current?.contentWindow?.postMessage({ source: 'agentic-cad', type: 'get-commands' }, window.location.origin);
        // Sync the sidebar's starting state (open) — the engine's CSS defaults to hidden
        // until this message arrives, so the host's `panels` state is the source of truth.
        iframeRef.current?.contentWindow?.postMessage({ source: 'agentic-cad', type: 'set-panels', visible: panels }, window.location.origin);
        const step = stepText ? null : window.localStorage.getItem(HANDOFF_TO_CHILI_STEP);
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

      if (data.type === 'preview-ready') {
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
          // Manual edits always create a derived revision; the import endpoint
          // validates parent ownership and finalizes its artifacts before saving.
          const savePath = `/api/projects/${projectSlug}/chili-import`;
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
  }, [onSaved, preview, projectSlug, parentRevisionId, stepText, panels]);

  useEffect(() => {
    if (bridgeReady && preview && iframeRef.current?.contentWindow) iframeRef.current.contentWindow.postMessage({ source: 'agentic-cad', type: 'import-preview', preview }, window.location.origin);
  }, [bridgeReady, preview]);

  useEffect(() => {
    if (bridgeReady && stepText && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ source: 'agentic-cad', type: 'import-step', step: stepText, name: 'model' }, window.location.origin);
    }
  }, [bridgeReady, stepText]);

  const statusMessage = status === 'error' ? errorMessage
    : status === 'saved' ? `Saved revision ${savedRevisionNumber}`
    : status === 'saving' ? 'Saving revision…'
    : status === 'importing' ? 'Importing geometry…'
    : status === 'loading' ? 'Loading modeling engine…' : '';

  return (
    <section ref={workbenchRef} className={`cad-workbench ${embedded ? 'cad-workbench-embedded' : ''}`} aria-label="CadPilot workbench" data-status={status}>
      <ViewportTools commands={commands} ready={bridgeReady && status !== 'importing' && status !== 'saving'}
        panels={panels} state={engineState} canSave={Boolean(projectSlug)}
        cancel={() => iframeRef.current?.contentWindow?.postMessage({ source: 'agentic-cad', type: 'cancel-command' }, window.location.origin)}
        execute={(key) => {
          iframeRef.current?.contentWindow?.postMessage({ source: 'agentic-cad', type: 'execute-command', key }, window.location.origin);
        }}
        togglePanels={() => {
          setPanels(!panels);
          iframeRef.current?.contentWindow?.postMessage({ source: 'agentic-cad', type: 'set-panels', visible: !panels }, window.location.origin);
        }}
        setNavPreset={(preset) => {
          iframeRef.current?.contentWindow?.postMessage({ source: 'agentic-cad', type: 'set-nav-preset', preset }, window.location.origin);
        }} />
      <div className="cad-scene-frame">
        {pluginUrl && <iframe ref={iframeRef} className="chili-editor-iframe"
          src={`/chili3d/index.html?plugin=${encodeURIComponent(pluginUrl)}`}
          title="CadPilot modeling canvas" allow="fullscreen" />}
        {status === 'loading' && <div className="cad-engine-loading" role="status">Loading modeling engine…</div>}
      </div>
      <FeatureTimeline
        list={featureList}
        ready={bridgeReady && status !== 'importing' && status !== 'saving'}
        onSetRollback={(index) => iframeRef.current?.contentWindow?.postMessage({ source: 'agentic-cad', type: 'set-rollback-index', index }, window.location.origin)}
        onToggleSuppressed={(id, suppressed) => iframeRef.current?.contentWindow?.postMessage({ source: 'agentic-cad', type: 'set-feature-suppressed', id, suppressed }, window.location.origin)}
        onSetParameter={(id, key, value) => iframeRef.current?.contentWindow?.postMessage({ source: 'agentic-cad', type: 'set-feature-parameter', id, key, value }, window.location.origin)}
      />
      {statusMessage && status !== 'loading' && <div className="cad-workbench-notice" role={status === 'error' ? 'alert' : 'status'}>{statusMessage}</div>}
    </section>
  );
}
