import Image from 'next/image';
import { LandingNav } from '@/components/landing/landing-nav';
import { Hero } from '@/components/landing/hero';
import { Workflow } from '@/components/landing/workflow';
import { ProofSection } from '@/components/landing/proof-section';
import { FinalCta } from '@/components/landing/final-cta';
import { LandingSignals } from '@/components/landing/landing-signals';
import { ProductSurface } from '@/components/landing/product-surface';
import { generateLandingModel } from '@/components/cad/replicad-server-model';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [gear, robot, table] = await Promise.all([generateLandingModel('spur-gear'), generateLandingModel('desktop-robot'), generateLandingModel('workbench-table')]);
  return <main className="landing-shell reference-page"><LandingNav /><Hero model={gear} /><LandingSignals /><ProductSurface model={robot} /><Workflow model={table} /><ProofSection model={gear} /><FinalCta /><footer className="landing-footer"><Image src="/brand/agentic-cad-logo.svg" alt="Agentic CAD" width={240} height={64} /><span>Design intent → editable geometry.</span><span>© 2026 Agentic CAD</span></footer></main>;
}
