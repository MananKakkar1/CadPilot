'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/magicui/button';
import { Badge } from '@/components/magicui/badge';
import type { AiCadPart } from './ai-cad-worker';
import { createViewer, type Viewer } from './viewer-kit';

function Scene({ parts }: { parts: AiCadPart[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const partsRef = useRef(parts);
  partsRef.current = parts;

  useEffect(() => {
    let disposed = false;
    if (!canvasRef.current) return;
    createViewer(canvasRef.current, { interactive: true }).then((viewer) => {
      if (disposed) return viewer.dispose();
      viewerRef.current = viewer;
      viewer.setParts(partsRef.current);
    });
    return () => {
      disposed = true;
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewerRef.current?.setParts(parts);
  }, [parts]);

  return (
    <div className="cad-scene">
      <canvas ref={canvasRef} />
      <div className="scene-grid" />
    </div>
  );
}

type Status = 'idle' | 'generating' | 'building' | 'ready' | 'error';
type WorkerMessage =
  | { id: number; type: 'progress'; part: AiCadPart; index: number; total: number }
  | { id: number; type: 'done'; result: { parts: AiCadPart[]; metrics: { volume: number; surfaceArea: number } } }
  | { id: number; type: 'error'; error: string };

export function AiCadStudio() {
  const [prompt, setPrompt] = useState('A hex-head M8 bolt, 40mm long');
  const [refinement, setRefinement] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('Describe a part and generate it.');
  const [code, setCode] = useState('');
  const [parts, setParts] = useState<AiCadPart[]>([]);
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const nextWorker = new Worker(new URL('./ai-cad-worker.ts', import.meta.url));
    worker.current = nextWorker;
    nextWorker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.id !== requestId.current) return;
      if (event.data.type === 'error') {
        setStatus('error');
        setMessage(event.data.error);
        return;
      }
      if (event.data.type === 'progress') {
        const { part, index, total } = event.data;
        setParts((current) => [...current, part]);
        setMessage(`Meshing part ${index + 1}/${total}: ${part.name}`);
        return;
      }
      if (event.data.type === 'done') {
        setStatus('ready');
        setMessage(`Model built successfully — ${event.data.result.parts.length} part${event.data.result.parts.length === 1 ? '' : 's'}.`);
      }
    };
    return () => nextWorker.terminate();
  }, []);

  const runGeneration = async (userText: string, { refine }: { refine: boolean }) => {
    if (!userText.trim() || status === 'generating' || status === 'building') return;
    setStatus('generating');
    setMessage(refine ? 'Asking Gemini to refine the model…' : 'Asking Gemini for replicad code… high-detail assemblies can take a couple of minutes.');
    setParts([]);
    try {
      const response = await fetch('/api/generate-cad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refine ? { prompt: userText, previousCode: code } : { prompt: userText }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error ?? 'Failed to generate code.');
      setCode(data.code as string);
      setStatus('building');
      setMessage('Building geometry with Replicad…');
      worker.current?.postMessage({ id: ++requestId.current, code: data.code });
      if (refine) setRefinement('');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const busy = status === 'generating' || status === 'building';
  const canRefine = !!code && !busy;
  const totals = useMemo(
    () => parts.reduce((acc, part) => ({ volume: acc.volume + part.volume, surfaceArea: acc.surfaceArea + part.surfaceArea }), { volume: 0, surfaceArea: 0 }),
    [parts],
  );

  return (
    <div className="ai-cad-studio">
      <aside className="ai-cad-panel">
        <Badge>PROMPT TO CAD</Badge>
        <h1>Describe an object.<br /><em>Gemini writes the solid.</em></h1>
        <textarea
          className="ai-cad-textarea"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="e.g. A spur gear with 24 teeth and a 12mm bore"
          rows={5}
        />
        <Button onClick={() => runGeneration(prompt, { refine: false })} disabled={busy}>
          {busy ? 'Working…' : 'Generate model'} <span>→</span>
        </Button>
        <div className="ai-cad-status">
          <i className={`status-dot ${status === 'error' ? 'status-dot-error' : ''}`} />
          {message}
        </div>
        {canRefine && (
          <div className="ai-cad-refine">
            <div className="control-header">
              <span>REFINE THIS MODEL</span>
            </div>
            <textarea
              className="ai-cad-textarea"
              value={refinement}
              onChange={(event) => setRefinement(event.target.value)}
              placeholder="e.g. Make the wheels bigger and the body lower"
              rows={3}
            />
            <Button variant="outline" onClick={() => runGeneration(refinement, { refine: true })} disabled={busy || !refinement.trim()}>
              Apply refinement <span>→</span>
            </Button>
          </div>
        )}
        {code && (
          <details className="ai-cad-code">
            <summary>Generated replicad code</summary>
            <pre>{code}</pre>
          </details>
        )}
      </aside>
      <section className="ai-cad-viewport" aria-label="Generated CAD model preview">
        <Scene parts={parts} />
        <div className="canvas-label canvas-label-top">AI GENERATED / PREVIEW</div>
        <div className="canvas-label canvas-label-bottom">
          <span><i className="status-dot" /> {parts.length > 0 ? `${parts.length} part${parts.length === 1 ? '' : 's'} · ${totals.volume} mm³ · ${totals.surfaceArea} mm²` : 'No model yet'}</span>
          <span>Drag to orbit · Right-drag to pan · Scroll to zoom</span>
        </div>
      </section>
    </div>
  );
}
