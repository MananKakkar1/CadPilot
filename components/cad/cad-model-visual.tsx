'use client';

import { useEffect, useRef, useState } from 'react';
import type { CadModelId, CadModelParams, CadModelResult } from './replicad-models';
import { labelForModel } from './replicad-models';
import { createViewer, type Viewer } from './viewer-kit';

const modelColors: Record<CadModelId, number> = {
  'spur-gear': 0x2563eb,
  'phone-stand': 0xf97316,
  'workbench-table': 0x059669,
  'desktop-robot': 0x7c3aed,
};

export function CadModelVisual({ model, initialResult, eyebrow = 'REPLICAD / OPENCASCADE', className = '', priority = false }: { model: CadModelId; initialResult?: CadModelResult; eyebrow?: string; className?: string; priority?: boolean }) {
  const containerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [result, setResult] = useState<CadModelResult | null>(null);
  const [visible, setVisible] = useState(priority);
  // `createViewer` resolves asynchronously, so its callback would otherwise close over whatever
  // `result` was when the effect ran (null on first paint, even when `initialResult` is supplied).
  // The ref always holds the latest geometry, so the viewer is populated as soon as it exists.
  const resultRef = useRef<CadModelResult | null>(null);
  resultRef.current = result;

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    if (!visible) return;
    if (initialResult) { setResult(initialResult); return; }
    const worker = new Worker(new URL('./cad-worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<{ result?: CadModelResult }>) => setResult(event.data.result ?? null);
    worker.postMessage({ id: 1, params: { model, values: { teeth: 20, module: 2, bore: 10, thickness: 5, tilt: 68, width: 72, height: 92 } } as CadModelParams });
    return () => worker.terminate();
  }, [initialResult, model, visible]);

  useEffect(() => {
    let disposed = false;
    if (!visible || !canvasRef.current) return;
    createViewer(canvasRef.current, { interactive: false, autoRotate: true }).then((created) => {
      if (disposed) return created.dispose();
      viewerRef.current = created;
      const latest = resultRef.current;
      created.setParts(latest ? [{ mesh: latest.mesh, color: modelColors[model] }] : []);
    });
    return () => { disposed = true; viewerRef.current?.dispose(); viewerRef.current = null; };
  }, [model, visible]);

  useEffect(() => {
    viewerRef.current?.setParts(result ? [{ mesh: result.mesh, color: modelColors[model] }] : []);
  }, [model, result]);

  return <figure ref={containerRef} className={`cad-model-visual ${className}`} aria-label={`${labelForModel(model)} generated with Replicad`}><div className="model-visual-meta"><span className="model-visual-label">{eyebrow}</span><span>{labelForModel(model)}</span></div>{visible ? <canvas ref={canvasRef} /> : <div className="cad-model-placeholder" aria-hidden="true" />}<div className="model-visual-foot"><span>{result ? 'Valid solid' : visible ? 'Building geometry' : 'Preview loads on scroll'}</span><span>{result ? `${result.metrics.volume} mm³` : 'Replicad / OpenCascade'}</span></div></figure>;
}
