'use client';

import { Box, Gauge, Route } from 'lucide-react';
import { BentoCard, BentoGrid } from '@/components/magicui/bento-grid';
import { DotPattern } from '@/components/magicui/dot-pattern';
import { Safari } from '@/components/magicui/safari';
import { SpinningText } from '@/components/magicui/spinning-text';

export function ProductSurface() {
  return <section className="product-surface" id="models"><div className="product-surface-copy"><span className="ui-badge">THE WORKSPACE</span><h2>A calm surface for complex parts.</h2><p>Keep the model visible while the system turns a brief into geometry, metrics, and a next step.</p><SpinningText className="product-seal" radius={7} duration={18}>DESIGN · INTENT · GEOMETRY · </SpinningText></div><div className="safari-stage"><Safari url="agentic-cad.local/studio" imageSrc="/brand/agentic-cad-logo-light.svg" mode="default" /><div className="safari-caption">A live Replicad workspace, framed for review.</div></div><BentoGrid className="product-bento"><BentoCard name="Native geometry" description="Every preview is generated from a real Replicad solid." href="#proof" cta="Inspect the model" Icon={Box} className="product-bento-card" background={<DotPattern className="opacity-25" />} /><BentoCard name="Build health" description="Volume, surface area, and validity stay in the same view." href="#proof" cta="See the proof" Icon={Gauge} className="product-bento-card" background={<div className="bento-radial" />} /><BentoCard name="Decision path" description="Move from brief to editable output without losing context." href="#how-it-works" cta="Follow the loop" Icon={Route} className="product-bento-card" background={<div className="bento-lines" />} /></BentoGrid></section>;
}
