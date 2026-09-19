'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/magicui/button';
import type { AiCadPart } from './ai-cad-worker';

function Scene({ parts }: { parts: AiCadPart[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{ cleanup: () => void; group: { rotation: { x: number; y: number; z: number }; scale: { setScalar: (value: number) => void } } } | null>(null);
  const [drag, setDrag] = useState(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let disposed = false;
    import('three').then((THREE) => {
      if (disposed || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000);
      camera.position.set(9, 8, 11);
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.AmbientLight(0xffefe5, 1.8));
      const light = new THREE.DirectionalLight(0xffb18f, 4);
      light.position.set(4, 5, 8);
      scene.add(light);
      const group = new THREE.Group();
      scene.add(group);
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / Math.max(rect.height, 1);
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener('resize', resize);
      if (parts.length > 0) {
        for (const part of parts) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.mesh.vertices, 3));
          geometry.setIndex(part.mesh.triangles);
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.34, metalness: 0.45, side: THREE.DoubleSide }));
          group.add(mesh);
        }
        const box = new THREE.Box3().setFromObject(group);
        const size = box.getSize(new THREE.Vector3()).length();
        group.scale.setScalar(8 / Math.max(size, 1));
        const center = box.getCenter(new THREE.Vector3());
        group.children.forEach((child) => child.position.sub(center));
      }
      let raf = 0;
      const animate = () => {
        raf = requestAnimationFrame(animate);
        renderer.render(scene, camera);
      };
      animate();
      sceneRef.current = {
        group,
        cleanup: () => {
          cancelAnimationFrame(raf);
          window.removeEventListener('resize', resize);
          renderer.dispose();
        },
      };
    });
    return () => {
      disposed = true;
      sceneRef.current?.cleanup();
      sceneRef.current = null;
    };
  }, [parts]);

  return (
    <div
      className="cad-scene"
      onPointerDown={(event) => {
        setDrag(true);
        last.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (!drag || !sceneRef.current) return;
        sceneRef.current.group.rotation.y += (event.clientX - last.current.x) * 0.01;
        sceneRef.current.group.rotation.x += (event.clientY - last.current.y) * 0.01;
        last.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => setDrag(false)}
      onPointerLeave={() => setDrag(false)}
      onWheel={(event) => sceneRef.current?.group.scale.setScalar(Math.max(0.4, Math.min(2, 1 - event.deltaY * 0.0006)))}
    >
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
  const [passes, setPasses] = useState(1);
  const passesRef = useRef(passes);
  passesRef.current = passes;
  const [references, setReferences] = useState<{ title: string; uri: string }[]>([]);
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
        const partCount = event.data.result.parts.length;
        const fidelityNote = passesRef.current === 2 ? ' · refined for fidelity (2-pass)' : '';
        setMessage(`Model built successfully — ${partCount} part${partCount === 1 ? '' : 's'}${fidelityNote}.`);
      }
    };
    return () => nextWorker.terminate();
  }, []);

  const runGeneration = async (userText: string, { refine }: { refine: boolean }) => {
    if (!userText.trim() || status === 'generating' || status === 'building') return;
    setStatus('generating');
    setMessage(refine ? 'Asking Gemini to refine the model…' : 'Asking Gemini for replicad code, then running a second pass to refine it for fidelity… high-detail assemblies can take a couple of minutes.');
    setParts([]);
    setReferences([]);
    try {
      const response = await fetch('/api/generate-cad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(refine ? { prompt: userText, previousCode: code } : { prompt: userText }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error ?? 'Failed to generate code.');
      setCode(data.code as string);
      setPasses(data.passes === 2 ? 2 : 1);
      setReferences(Array.isArray(data.references) ? data.references : []);
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
        <p className="section-kicker">PROMPT TO CAD</p>
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
        {references.length > 0 && (
          <details className="ai-cad-code" open>
            <summary>Reference sources used for fidelity ({references.length})</summary>
            <ul className="ai-cad-references">
              {references.map((reference) => (
                <li key={reference.uri}>
                  <a href={reference.uri} target="_blank" rel="noreferrer">
                    {reference.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>
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
          <span>{parts.length > 0 ? `${parts.length} part${parts.length === 1 ? '' : 's'} · ${totals.volume} mm³ · ${totals.surfaceArea} mm²` : 'No model yet'}</span>
          <span>Drag to orbit · Scroll to zoom</span>
        </div>
      </section>
    </div>
  );
}
