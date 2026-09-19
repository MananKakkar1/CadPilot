'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/magicui/button';
import { Badge } from '@/components/magicui/badge';
import type { AiCadResult } from './ai-cad-worker';

function Scene({ result }: { result: AiCadResult | null }) {
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
      if (result) {
        for (const part of result.parts) {
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
        if (!drag) group.rotation.z += 0.002;
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
  }, [result, drag]);

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

export function AiCadStudio() {
  const [prompt, setPrompt] = useState('A hex-head M8 bolt, 40mm long');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('Describe a part and generate it.');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<AiCadResult | null>(null);
  const worker = useRef<Worker | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const nextWorker = new Worker(new URL('./ai-cad-worker.ts', import.meta.url));
    worker.current = nextWorker;
    nextWorker.onmessage = (event: MessageEvent<{ id: number; result?: AiCadResult; error?: string }>) => {
      if (event.data.id !== requestId.current) return;
      if (event.data.error) {
        setStatus('error');
        setMessage(event.data.error);
        return;
      }
      if (event.data.result) {
        setResult(event.data.result);
        setStatus('ready');
        setMessage('Model built successfully.');
      }
    };
    return () => nextWorker.terminate();
  }, []);

  const generate = async () => {
    if (!prompt.trim() || status === 'generating' || status === 'building') return;
    setStatus('generating');
    setMessage('Asking Gemini for replicad code… high-detail assemblies can take a couple of minutes.');
    setResult(null);
    try {
      const response = await fetch('/api/generate-cad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error ?? 'Failed to generate code.');
      setCode(data.code as string);
      setStatus('building');
      setMessage('Building geometry with Replicad…');
      worker.current?.postMessage({ id: ++requestId.current, code: data.code });
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const busy = status === 'generating' || status === 'building';

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
        <Button onClick={generate} disabled={busy}>
          {busy ? 'Working…' : 'Generate model'} <span>→</span>
        </Button>
        <div className="ai-cad-status">
          <i className={`status-dot ${status === 'error' ? 'status-dot-error' : ''}`} />
          {message}
        </div>
        {code && (
          <details className="ai-cad-code">
            <summary>Generated replicad code</summary>
            <pre>{code}</pre>
          </details>
        )}
      </aside>
      <section className="ai-cad-viewport" aria-label="Generated CAD model preview">
        <Scene result={result} />
        <div className="canvas-label canvas-label-top">AI GENERATED / PREVIEW</div>
        <div className="canvas-label canvas-label-bottom">
          <span><i className="status-dot" /> {result ? `${result.parts.length} part${result.parts.length === 1 ? '' : 's'} · ${result.metrics.volume} mm³ · ${result.metrics.surfaceArea} mm²` : 'No model yet'}</span>
          <span>Drag to orbit · Scroll to zoom</span>
        </div>
      </section>
    </div>
  );
}
