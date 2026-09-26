'use client';

import { useEffect, useRef, useState } from 'react';
import { Box } from 'lucide-react';

type PreviewPart = { name?: string; color?: string; vertices: number[]; triangles: number[] };
type Preview = { parts?: PreviewPart[]; vertices?: number[]; triangles?: number[]; color?: string };

export function ProjectCadViewport({ artifactId, revisionNumber }: { artifactId?: string; revisionNumber?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragging, setDragging] = useState(false);
  const view = useRef({ x: 0, y: 0, scale: 1, lastX: 0, lastY: 0 });

  useEffect(() => {
    if (!artifactId) return;
    fetch(`/api/artifacts/${artifactId}`).then((response) => response.ok ? response.json() : null).then(setPreview).catch(() => setPreview(null));
  }, [artifactId]);

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
      scene.add(new THREE.AmbientLight(0xffffff, 1.8));
      const light = new THREE.DirectionalLight(0x9bbcff, 4);
      light.position.set(4, 7, 8);
      scene.add(light);
      const group = new THREE.Group(); scene.add(group);
      const parts = preview?.parts ?? (preview?.vertices && preview.triangles ? [{ vertices: preview.vertices, triangles: preview.triangles, color: preview.color }] : []);
      for (const part of parts) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.vertices, 3));
        geometry.setIndex(part.triangles); geometry.computeVertexNormals();
        group.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: part.color ?? '#6366f1', roughness: 0.3, metalness: 0.35 })));
      }
      let fitScale = 1;
      if (group.children.length) {
        const box = new THREE.Box3().setFromObject(group); const size = box.getSize(new THREE.Vector3()).length();
        fitScale = 7 / Math.max(size, 1); group.scale.setScalar(fitScale); const center = box.getCenter(new THREE.Vector3());
        group.children.forEach((child) => child.position.sub(center));
      }
      const resize = () => { const rect = canvas.getBoundingClientRect(); renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / Math.max(rect.height, 1); camera.updateProjectionMatrix(); };
      resize(); window.addEventListener('resize', resize);
      let raf = 0; const animate = () => { raf = requestAnimationFrame(animate); group.rotation.x = view.current.x; group.rotation.y = view.current.y; group.scale.setScalar(fitScale * view.current.scale); renderer.render(scene, camera); }; animate();
      return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); renderer.dispose(); };
    });
    return () => { disposed = true; };
  }, [preview]);

  return <div className="project-cad-viewport" onPointerDown={(event) => { setDragging(true); view.current.lastX = event.clientX; view.current.lastY = event.clientY; }} onPointerMove={(event) => { if (!dragging) return; view.current.y += (event.clientX - view.current.lastX) * 0.01; view.current.x += (event.clientY - view.current.lastY) * 0.01; view.current.lastX = event.clientX; view.current.lastY = event.clientY; }} onPointerUp={() => setDragging(false)} onPointerLeave={() => setDragging(false)} onWheel={(event) => { view.current.scale = Math.max(.55, Math.min(1.8, view.current.scale - event.deltaY * .0008)); }}>
    <canvas ref={canvasRef} />
    <div className="project-cad-grid" />
    <div className="project-cad-label"><Box size={14} /> {revisionNumber ? `VALIDATED PREVIEW · REVISION ${revisionNumber}` : 'CAD PREVIEW'}</div>
    {!artifactId && <div className="project-cad-empty">Build a revision to preview its validated geometry.</div>}
  </div>;
}
