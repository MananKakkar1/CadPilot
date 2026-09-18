import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function LandingNav() {
  return <header className="landing-nav"><Link href="#top" className="landing-brand" aria-label="Agentic CAD home"><Image src="/brand/agentic-cad-logo-light.svg" alt="Agentic CAD" width={240} height={64} priority /></Link><nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#models">Models</a><a href="#proof">Why Agentic CAD</a></nav><Link href="/studio"><Button>Open workspace <span>↗</span></Button></Link></header>;
}
