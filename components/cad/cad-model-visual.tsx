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

export function CadModelVisual({ model, initialResult, eyebrow = 'REPLICAD / OPENCASCADE', className = '' }: { model: CadModelId; initialResult?: CadModelResult; eyebrow?: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<CadModelResult | null>(null);

  useEffect(() => {
    if (initialResult) { setResult(initialResult); return; }
    const worker = new Worker(new URL('./cad-worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<{ result?: CadModelResult }>) => setResult(event.data.result ?? null);
    worker.postMessage({ id: 1, params: { model, values: { teeth: 20, module: 2, bore: 10, thickness: 5, tilt: 68, width: 72, height: 92 } } as CadModelParams });
    return () => worker.terminate();
  }, [initialResult, model]);

  useEffect(() => {
    let disposed = false;
    let viewer: Viewer | null = null;
    if (!canvasRef.current) return;
    createViewer(canvasRef.current, { interactive: false, autoRotate: true }).then((created) => {
      if (disposed) return created.dispose();
      viewer = created;
      created.setParts(result ? [{ mesh: result.mesh, color: modelColors[model] }] : []);
    });
    return () => { disposed = true; viewer?.dispose(); };
  }, [model, result]);

  return <figure className={`cad-model-visual ${className}`} aria-label={`${labelForModel(model)} generated with Replicad`}><div className="model-visual-meta"><span className="model-visual-label">{eyebrow}</span><span>{labelForModel(model)}</span></div><canvas ref={canvasRef} /><div className="model-visual-foot"><span>Valid solid</span><span>{result ? `${result.metrics.volume} mm³` : 'Building geometry'}</span></div></figure>;
}
