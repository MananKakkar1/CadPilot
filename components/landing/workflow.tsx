'use client';
import { useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { AnimatedBeam } from '@/components/ui/animated-beam';

const stages = [['01', 'Intent', 'Start with the engineering brief, not a blank canvas.'], ['02', 'Plan', 'Translate constraints into a parametric build sequence.'], ['03', 'Build', 'Generate a solid you can inspect, edit, and version.'], ['04', 'Evaluate', 'Check geometry validity and manufacturing fit as you go.']];

export function Workflow() {
  const containerRef = useRef<HTMLDivElement>(null); const refs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  return <section className="section workflow" id="how-it-works"><div className="section-intro"><Badge>THE LOOP</Badge><h2>From intent to a solid you can trust.</h2><p>A clear engineering loop keeps the model explainable when the brief changes.</p></div><div className="workflow-map" ref={containerRef}>{stages.map(([number,title,copy], index) => <article key={title} className="workflow-stage" ref={refs[index]}><span className="stage-number">{number}</span><h3>{title}</h3><p>{copy}</p></article>)}<AnimatedBeam containerRef={containerRef} fromRef={refs[0]} toRef={refs[1]} duration={4} pathColor="#eee8dc" gradientStartColor="#df7048" gradientStopColor="#eee8dc" /><AnimatedBeam containerRef={containerRef} fromRef={refs[1]} toRef={refs[2]} duration={4} delay={1} pathColor="#eee8dc" gradientStartColor="#df7048" gradientStopColor="#eee8dc" /><AnimatedBeam containerRef={containerRef} fromRef={refs[2]} toRef={refs[3]} duration={4} delay={2} pathColor="#eee8dc" gradientStartColor="#df7048" gradientStopColor="#eee8dc" /></div></section>;
}
