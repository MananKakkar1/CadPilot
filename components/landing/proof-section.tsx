'use client';
import { MagicCard } from '@/components/magicui/magic-card';
import { NumberTicker } from '@/components/magicui/number-ticker';
import { SparklesText } from '@/components/magicui/sparkles-text';
import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';

export function ProofSection({ model }: { model: CadModelResult }) {
  return <section className="reference-section proof" id="proof"><CadModelVisual model="spur-gear" initialResult={model} className="proof-model" eyebrow="MODEL INSPECTION / 01" /><div className="reference-copy"><p className="section-kicker">ENGINEERING PROOF</p><h2><SparklesText colors={{ first: '#4f46e5', second: '#ec4899' }}>The output is a system.</SparklesText></h2><p>Native solids, measurable results, and a design history your team can understand after the first generation.</p><div className="proof-metrics"><MagicCard className="proof-metric" gradientFrom="#4f46e5" gradientTo="#06b6d4"><strong><NumberTicker value={model.metrics.volume} /></strong><span>mm³ solid volume</span></MagicCard><MagicCard className="proof-metric" gradientFrom="#7c3aed" gradientTo="#ec4899"><strong><NumberTicker value={model.metrics.surfaceArea} /></strong><span>mm² surface area</span></MagicCard></div><div className="proof-list"><div><strong>Native geometry</strong><span>Built through Replicad and OpenCascade, not a flat visual approximation.</span></div><div><strong>Inspectable decisions</strong><span>Parameters stay close to the model so the next change has context.</span></div><div><strong>Ready to iterate</strong><span>Take the first solid into Studio and keep building from the same intent.</span></div></div></div></section>;
}
