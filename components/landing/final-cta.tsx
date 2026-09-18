import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function FinalCta() {
  return <section className="final-cta"><p className="eyebrow">A better first move</p><h2>Start with a part.</h2><p>Bring the brief. Leave with a system you can keep working on.</p><Link href="/studio"><Button>Open live workspace <span>↗</span></Button></Link></section>;
}
