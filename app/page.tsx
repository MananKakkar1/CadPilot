import Image from 'next/image';
import { LandingNav } from '@/components/landing/landing-nav';
import { Hero } from '@/components/landing/hero';
import { Workflow } from '@/components/landing/workflow';
import { ProofSection } from '@/components/landing/proof-section';
import { FinalCta } from '@/components/landing/final-cta';
import { generateLandingModel } from '@/components/cad/replicad-server-model';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [gear, stand] = await Promise.all([generateLandingModel('spur-gear'), generateLandingModel('phone-stand')]);
  return <main className="landing-shell reference-page"><LandingNav /><Hero model={gear} /><Workflow model={stand} /><ProofSection model={gear} /><FinalCta /><footer className="landing-footer"><Image src="/brand/agentic-cad-logo-light.svg" alt="Agentic CAD" width={240} height={64} /><span>Design intent → editable geometry.</span><span>© 2026 Agentic CAD</span></footer></main>;
}
