import Image from 'next/image';
import { LandingNav } from '@/components/landing/landing-nav';
import { Hero } from '@/components/landing/hero';
import { Workflow } from '@/components/landing/workflow';
import { ProofSection } from '@/components/landing/proof-section';
import { FinalCta } from '@/components/landing/final-cta';
import { LandingSignals } from '@/components/landing/landing-signals';
import { ProductSurface } from '@/components/landing/product-surface';
import { generateLandingModel } from '@/components/cad/replicad-server-model';

export const revalidate = 3600;

export default async function Home() {
  const gear = await generateLandingModel('spur-gear');
  return <main className="landing-shell reference-page"><LandingNav /><Hero model={gear} /><LandingSignals /><ProductSurface model={gear} /><Workflow model={gear} /><ProofSection model={gear} /><FinalCta /><footer className="landing-footer"><Image src="/brand/agentic-cad-logo.svg" alt="Agentic CAD" width={240} height={64} /><span>Design intent → editable geometry.</span><span>© 2026 Agentic CAD</span></footer></main>;
}
