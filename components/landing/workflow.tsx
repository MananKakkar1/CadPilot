'use client';
import { useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { AnimatedBeam } from '@/components/ui/animated-beam';
import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';

const stages = [['01', 'Intent', 'Start with the engineering brief, not a blank canvas.'], ['02', 'Plan', 'Translate constraints into a parametric build sequence.'], ['03', 'Build', 'Generate a solid you can inspect, edit, and version.'], ['04', 'Evaluate', 'Check geometry validity and manufacturing fit as you go.']];

export function Workflow({ model }: { model: CadModelResult }) {
  const containerRef = useRef<HTMLDivElement>(null); const refs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  return <section className="reference-section workflow" id="how-it-works"><div className="reference-copy"><Badge>THE LOOP</Badge><h2>One brief. One visible chain of decisions.</h2><p>Agentic CAD turns intent into a sequence your team can inspect, question, and carry forward.</p><div className="workflow-map" ref={containerRef}>{stages.map(([number,title,copy], index) => <article key={title} className="workflow-stage" ref={refs[index]}><span className="stage-number">{number}</span><h3>{title}</h3><p>{copy}</p></article>)}<AnimatedBeam containerRef={containerRef} fromRef={refs[0]} toRef={refs[1]} duration={4} pathColor="#d2c7bd" gradientStartColor="#df7048" gradientStopColor="#262421" /><AnimatedBeam containerRef={containerRef} fromRef={refs[1]} toRef={refs[2]} duration={4} delay={1} pathColor="#d2c7bd" gradientStartColor="#df7048" gradientStopColor="#262421" /><AnimatedBeam containerRef={containerRef} fromRef={refs[2]} toRef={refs[3]} duration={4} delay={2} pathColor="#d2c7bd" gradientStartColor="#df7048" gradientStopColor="#262421" /></div></div><CadModelVisual model="phone-stand" initialResult={model} className="workflow-model" eyebrow="GENERATED GEOMETRY / 02" /></section>;
}
