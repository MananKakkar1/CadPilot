'use client';

import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';

export function ProductSurface({ model }: { model: CadModelResult }) {
  return <section className="product-surface" id="models"><div className="product-surface-copy"><p className="section-kicker">THE WORKSPACE</p><h2>A calm surface for complex parts.</h2><p>Keep the model visible while the system turns a brief into geometry, metrics, and a next step.</p></div><div className="safari-stage"><CadModelVisual model="spur-gear" initialResult={model} eyebrow="REPLICAD SOLID / INSPECTION" className="safari-model" /><div className="safari-caption">The model stays visible while the agent works.</div></div><div className="product-notes"><div><strong>Native geometry</strong><span>Every preview comes from a real Replicad solid.</span></div><div><strong>Build health</strong><span>Volume, surface area, and validity stay in one view.</span></div><div><strong>Decision path</strong><span>Brief, plan, build, and revision remain connected.</span></div></div></section>;
}
