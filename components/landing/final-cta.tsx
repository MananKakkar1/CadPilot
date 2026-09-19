import Link from 'next/link';
import { AuroraText } from '@/components/magicui/aurora-text';
import { Button } from '@/components/magicui/button';

export function FinalCta() {
  return <section className="final-cta"><p className="eyebrow">A better first move</p><h2>Start with the <AuroraText colors={['#111111', '#737373', '#111111']}>brief.</AuroraText></h2><p>Bring the engineering intent. Leave with a system you can keep working on.</p><Link href="/studio"><Button>Open the live workspace <span>↗</span></Button></Link></section>;
}
