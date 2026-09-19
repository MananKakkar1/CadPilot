'use client';
import { useRef } from 'react';
import { AnimatedBeam } from '@/components/magicui/animated-beam';
import { MagicCard } from '@/components/magicui/magic-card';
import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';

const stages = [['01', 'Brief', 'Start with constraints, materials, and the reason the part exists.'], ['02', 'Resolve', 'Translate intent into a sequence of measurable operations.'], ['03', 'Build', 'Generate a real OpenCascade solid you can inspect and edit.'], ['04', 'Carry forward', 'Keep the model, metrics, and decisions ready for the next pass.']];

export function Workflow({ model }: { model: CadModelResult }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const refs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  return <section className="reference-section workflow" id="how-it-works"><div className="reference-copy"><p className="section-kicker">THE LOOP</p><h2>One brief. A visible chain of decisions.</h2><p>Every output has a reason behind it. Follow the path from a short engineering brief to native geometry.</p><div className="workflow-map" ref={containerRef}>{stages.map(([number, title, copy], index) => <div key={title} ref={refs[index]}><MagicCard className="workflow-stage" gradientFrom="#4f46e5" gradientTo="#06b6d4"><span className="stage-number">{number}</span><h3>{title}</h3><p>{copy}</p></MagicCard></div>)}<AnimatedBeam containerRef={containerRef} fromRef={refs[0]} toRef={refs[1]} duration={4} pathColor="#c7d2fe" gradientStartColor="#4f46e5" gradientStopColor="#06b6d4" /><AnimatedBeam containerRef={containerRef} fromRef={refs[1]} toRef={refs[2]} duration={4} delay={1} pathColor="#c7d2fe" gradientStartColor="#4f46e5" gradientStopColor="#06b6d4" /><AnimatedBeam containerRef={containerRef} fromRef={refs[2]} toRef={refs[3]} duration={4} delay={2} pathColor="#c7d2fe" gradientStartColor="#4f46e5" gradientStopColor="#06b6d4" /></div></div><CadModelVisual model="workbench-table" initialResult={model} className="workflow-model" eyebrow="REPLICAD ASSEMBLY / WORKBENCH TABLE" /></section>;
}
