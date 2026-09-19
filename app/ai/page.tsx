import Link from 'next/link';
import { AiCadStudio } from '@/components/cad/ai-cad-studio';

export default function AiStudioPage() {
  return (
    <main className="ai-studio-shell">
      <header className="ai-studio-nav">
        <Link href="/" className="studio-back">← Back to Agentic CAD</Link>
        <span className="studio-title">AI CAD agent · Gemini + Replicad</span>
      </header>
      <AiCadStudio />
    </main>
  );
}
