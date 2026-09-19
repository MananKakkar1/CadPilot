import Link from 'next/link';
import { AuroraText } from '@/components/magicui/aurora-text';
import { AnimatedShinyText } from '@/components/magicui/animated-shiny-text';
import { BorderBeam } from '@/components/magicui/border-beam';
import { Button } from '@/components/magicui/button';
import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';

export function Hero({ model }: { model: CadModelResult }) {
  return (
    <section className="reference-hero" id="top">
      <AnimatedShinyText className="hero-announcement">LIVE ENGINE / REPLICAD + OPENCASCADE</AnimatedShinyText>
      <div className="reference-hero-kicker"><span className="eyebrow-dot" /> Parametric design for teams that ship hardware</div>
      <h1>Turn intent into <AuroraText colors={['#f0784c', '#c4a4f1', '#f0784c']} speed={0.7}>real geometry.</AuroraText></h1>
      <p>Describe the part in plain language. Agentic CAD builds an editable solid, exposes every decision, and keeps the model ready for the next revision.</p>
      <div className="reference-hero-actions"><Link href="/studio"><Button>Open the live workspace <span>↗</span></Button></Link><a href="#how-it-works">See how the system works <span>↓</span></a></div>
      <div className="hero-model magic-model-frame"><CadModelVisual model="spur-gear" initialResult={model} eyebrow="REPLICAD SOLID / SPUR GEAR" /><BorderBeam size={140} duration={9} colorFrom="#f0784c" colorTo="#c4a4f1" /></div>
      <div className="hero-proof-row"><span>20 teeth</span><i /> <span>10 mm bore</span><i /> <span>{model.metrics.volume} mm³ volume</span><i /> <span>valid solid</span></div>
    </section>
  );
}
