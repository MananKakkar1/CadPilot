'use client';

import { useEffect, useRef, useState } from 'react';
import { createViewer, type Viewer } from './viewer-kit';

type Mesh = { vertices: number[]; triangles: number[]; normals?: number[] };
type Preview = Mesh & { parts?: Array<{ name?: string; color?: string | number; vertices: number[]; triangles: number[]; normals?: number[] }> };

export function PublicCadPreview({ slug, artifactId }: { slug: string; artifactId: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');

  useEffect(() => {
    if (!artifactId) {
      setState('empty');
      return;
    }
    let cancelled = false;
    let viewer: Viewer | null = null;
    fetch(`/api/public/projects/${slug}/artifacts/${artifactId}?inline=1`)
      .then((response) => response.ok ? response.json() as Promise<Preview> : Promise.reject(new Error('Preview unavailable.')))
      .then(async (preview) => {
        if (cancelled || !canvasRef.current) return;
        viewer = await createViewer(canvasRef.current, { interactive: true, autoRotate: true, ground: true });
        if (cancelled) {
          viewer.dispose();
          return;
        }
        viewerRef.current = viewer;
        const parts = preview.parts?.length
          ? preview.parts.map((part) => ({ mesh: { vertices: part.vertices, triangles: part.triangles, normals: part.normals }, color: part.color }))
          : [{ mesh: { vertices: preview.vertices, triangles: preview.triangles, normals: preview.normals } }];
        viewer.setParts(parts);
        setState('ready');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => {
      cancelled = true;
      viewer?.dispose();
      viewerRef.current = null;
    };
  }, [artifactId, slug]);

  return <div className="public-cad-preview" data-state={state}><canvas ref={canvasRef} aria-label="Interactive preview of the published CAD revision" />{state !== 'ready' && <div className="public-cad-preview-message" role={state === 'error' ? 'alert' : 'status'}>{state === 'loading' ? 'Loading published preview…' : state === 'empty' ? 'No preview mesh was published.' : 'Preview unavailable.'}</div>}<span className="public-cad-preview-hint">Drag to orbit · Scroll to zoom</span></div>;
}
