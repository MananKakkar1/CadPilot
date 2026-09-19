'use client';
import { Badge } from '@/components/magicui/badge';
import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';

export function ProofSection({ model }: { model: CadModelResult }) {
  return <section className="reference-section proof" id="proof"><CadModelVisual model="spur-gear" initialResult={model} className="proof-model" eyebrow="MODEL CONTEXT / INSPECTION" /><div className="reference-copy"><Badge>ENGINEERING PROOF</Badge><h2>Geometry that stays legible after generation.</h2><p>The useful part is not the first shape. It is the system underneath it: constraints, dependencies, and output that remain understandable.</p><div className="proof-list"><div><strong>Parametric by default</strong><span>Change the design intent without throwing away the model.</span></div><div><strong>Native 3D context</strong><span>Inspect the solid as geometry, not as a flat approximation.</span></div><div><strong>Ready to carry forward</strong><span>Move from a fast concept to a studio-ready artifact.</span></div></div></div></section>;
}
