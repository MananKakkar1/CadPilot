import Link from 'next/link';
import { ChiliEditor } from '@/components/cad/chili-editor';

export default function ChiliEditorPage() {
  return (
    <main className="ai-studio-shell">
      <header className="ai-studio-nav">
        <Link href="/ai" className="studio-back">← Back to AI CAD Studio</Link>
        <span className="studio-title">ChiliCAD editor <i className="status-dot" /> Chili3D · full parametric editing</span>
      </header>
      <ChiliEditor />
    </main>
  );
}
