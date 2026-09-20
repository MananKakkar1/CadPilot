import Link from 'next/link';
import { Button } from '@/components/magicui/button';
import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';

export function Hero({ model }: { model: CadModelResult }) {
  return (
    <section className="reference-hero" id="top">
      <div className="reference-hero-intro"><div><div className="hero-announcement">LIVE ENGINE / REPLICAD + OPENCASCADE</div><div className="reference-hero-kicker">Parametric design for teams that ship hardware</div><h1>Turn intent into real geometry.</h1></div><div className="reference-hero-detail"><p>Describe the part in plain language. Agentic CAD builds an editable solid, exposes every decision, and keeps the model ready for the next revision.</p><div className="reference-hero-actions"><Link href="/projects/new"><Button>Start a project <span>↗</span></Button></Link><a href="#how-it-works">See how the system works <span>↓</span></a></div></div></div>
      <CadModelVisual priority model="spur-gear" initialResult={model} eyebrow="REPLICAD SOLID / SPUR GEAR" className="hero-model" />
    </section>
  );
}
