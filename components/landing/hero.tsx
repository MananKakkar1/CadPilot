import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CadDemo } from '@/components/cad/cad-demo';
import { BorderBeam } from '@/components/ui/border-beam';

export function Hero() {
  return <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow reveal reveal-one"><span className="eyebrow-dot"/> Parametric CAD for engineering teams</p><h1 className="reveal reveal-two">Describe the part.<br /><em>Build the system.</em></h1><p className="hero-lede reveal reveal-three">Turn design intent into editable, constraint-aware geometry—then tune the system like an engineer.</p><div className="hero-actions reveal reveal-four"><Link href="/studio"><Button>Open live workspace <span>↗</span></Button></Link><a href="#how-it-works" className="text-action">See how it works <span>↓</span></a></div></div><div className="magic-beam-host"><BorderBeam size={100} duration={8} colorFrom="#df7048" colorTo="#eee8dc" /><CadDemo /></div></section>;
}
