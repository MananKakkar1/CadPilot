import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CadModelVisual } from '@/components/cad/cad-model-visual';

export function Hero() {
  return <section className="reference-hero" id="top"><div className="reference-hero-kicker"><span className="eyebrow-dot" /> Agentic CAD / design intent to geometry</div><h1>Build parts that understand <em>why</em> they work.</h1><p>Generate precise, editable 3D solids from an engineering brief—then keep every decision visible as the design evolves.</p><div className="reference-hero-actions"><Link href="/studio"><Button>Open live workspace <span>↗</span></Button></Link><a href="#how-it-works">Explore the workflow <span>↓</span></a></div><CadModelVisual model="spur-gear" className="hero-model" eyebrow="GENERATED GEOMETRY / 01" /></section>;
}
