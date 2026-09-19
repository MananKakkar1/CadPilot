import Link from 'next/link';
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text';
import { Button } from '@/components/magicui/button';
import { BentoCard, BentoGrid } from '@/components/magicui/bento-grid';
import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';
import { Box, Gauge, Layers3 } from 'lucide-react';

export function Hero({ model }: { model: CadModelResult }) {
  return (
    <section className="reference-hero" id="top">
      <div className="reference-hero-intro"><div><AnimatedShinyText className="hero-announcement">LIVE ENGINE / REPLICAD + OPENCASCADE</AnimatedShinyText><div className="reference-hero-kicker">Parametric design for teams that ship hardware</div><h1>Turn intent into real geometry.</h1></div><div className="reference-hero-detail"><p>Describe the part in plain language. Agentic CAD builds an editable solid, exposes every decision, and keeps the model ready for the next revision.</p><div className="reference-hero-actions"><Link href="/studio"><Button>Open the live workspace <span>↗</span></Button></Link><a href="#how-it-works">See how the system works <span>↓</span></a></div></div></div>
      <BentoGrid className="hero-bento"><BentoCard name="Spur gear" description="A live OpenCascade mesh, built from editable parameters." href="#proof" cta="Inspect geometry" Icon={Box} className="hero-bento-model" background={<CadModelVisual model="spur-gear" initialResult={model} eyebrow="REPLICAD SOLID / SPUR GEAR" className="hero-bento-cad" />} /><BentoCard name="Validated solid" description="Native geometry, ready for the next operation." href="#proof" cta="See the proof" Icon={Layers3} className="hero-bento-card hero-bento-card-cyan" background={<div className="hero-bento-pattern" />} /><BentoCard name={`${model.metrics.volume} mm³`} description="Measured solid volume from the generated shape." href="#proof" cta="View metrics" Icon={Gauge} className="hero-bento-card hero-bento-card-pink" background={<div className="hero-bento-pattern" />} /></BentoGrid>
    </section>
  );
}
