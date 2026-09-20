import Link from 'next/link';
import { Button } from '@/components/magicui/button';

export function FinalCta() {
  return <section className="final-cta"><p className="eyebrow">A better first move</p><h2>Start with the brief.</h2><p>Bring the engineering intent. Leave with a system you can keep working on.</p><Link href="/projects/new"><Button>Start a project <span>↗</span></Button></Link></section>;
}
