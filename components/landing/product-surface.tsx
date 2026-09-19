'use client';

import { Box, Gauge, Route } from 'lucide-react';
import { BentoCard, BentoGrid } from '@/components/magicui/bento-grid';
import { DotPattern } from '@/components/magicui/dot-pattern';
import { Safari } from '@/components/magicui/safari';
import { SpinningText } from '@/components/magicui/spinning-text';
import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';

export function ProductSurface({ model }: { model: CadModelResult }) {
  return <section className="product-surface" id="models"><div className="product-surface-copy"><p className="section-kicker">THE WORKSPACE</p><h2>A calm surface for complex parts.</h2><p>Keep the model visible while the system turns a brief into geometry, metrics, and a next step.</p><SpinningText className="product-seal" radius={7} duration={18}>REPLICAD · OPENCASCADE · THREE.JS · NEXT.JS · </SpinningText></div><div className="safari-stage"><Safari url="agentic-cad.local/studio" mode="default"><CadModelVisual model="desktop-robot" initialResult={model} eyebrow="REPLICAD ASSEMBLY / DESKTOP ROBOT" className="safari-model" /></Safari><div className="safari-caption">A multi-part Replicad assembly, framed for review.</div></div><BentoGrid className="product-bento"><BentoCard name="Native geometry" description="Every preview is generated from a real Replicad solid." href="#proof" cta="Inspect the model" Icon={Box} className="product-bento-card" background={<DotPattern className="opacity-25" />} /><BentoCard name="Build health" description="Volume, surface area, and validity stay in the same view." href="#proof" cta="See the proof" Icon={Gauge} className="product-bento-card" background={<div className="bento-radial" />} /><BentoCard name="Decision path" description="Move from brief to editable output without losing context." href="#how-it-works" cta="Follow the loop" Icon={Route} className="product-bento-card" background={<div className="bento-lines" />} /></BentoGrid></section>;
}
