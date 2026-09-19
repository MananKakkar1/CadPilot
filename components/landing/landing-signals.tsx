import { MagicCard } from '@/components/magicui/magic-card';
import { AnimatedGradientText } from '@/components/magicui/animated-gradient-text';
import { Marquee } from '@/components/magicui/marquee';
import { NumberTicker } from '@/components/magicui/number-ticker';

const signals = [
  ['NATIVE SOLIDS', 'OpenCascade geometry you can inspect and edit.'],
  ['VISIBLE HISTORY', 'Every constraint stays close to the generated part.'],
  ['TEAM READY', 'A shared model language from first brief to revision.'],
];

export function LandingSignals() {
  return <section className="landing-signals" aria-label="Agentic CAD capabilities"><p className="signals-kicker">A new kind of CAD instrument</p><Marquee pauseOnHover repeat={2} className="signals-marquee"><AnimatedGradientText colorFrom="#3157d5" colorTo="#7d9cff">Parametric by default</AnimatedGradientText><span>Native solids</span><span>Inspectable decisions</span><span>Ready to iterate</span></Marquee><div className="signals-grid">{signals.map(([title, copy]) => <MagicCard key={title} className="signal-card" gradientFrom="#3157d5" gradientTo="#7d9cff"><span>{title}</span><p>{copy}</p></MagicCard>)}</div><div className="signal-proof"><span>GENERATED LOCALLY</span><i /><strong><NumberTicker value={2} /> editable solids in this demo</strong><i /><span>REPLICAD / OPENCASCADE</span></div></section>;
}
