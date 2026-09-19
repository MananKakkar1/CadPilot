'use client';
import { MagicCard } from '@/components/magicui/magic-card';
import { NumberTicker } from '@/components/magicui/number-ticker';
import { SparklesText } from '@/components/magicui/sparkles-text';
import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';

export function ProofSection({ model }: { model: CadModelResult }) {
  return <section className="reference-section proof" id="proof"><CadModelVisual model="spur-gear" initialResult={model} className="proof-model" eyebrow="MODEL INSPECTION / 01" /><div className="reference-copy"><span className="ui-badge">ENGINEERING PROOF</span><h2><SparklesText colors={{ first: '#f0784c', second: '#c4a4f1' }}>The output is a system.</SparklesText></h2><p>Native solids, measurable results, and a design history your team can understand after the first generation.</p><div className="proof-metrics"><MagicCard className="proof-metric" gradientFrom="#f0784c" gradientTo="#c4a4f1"><strong><NumberTicker value={model.metrics.volume} /></strong><span>mm³ solid volume</span></MagicCard><MagicCard className="proof-metric" gradientFrom="#f0784c" gradientTo="#c4a4f1"><strong><NumberTicker value={model.metrics.surfaceArea} /></strong><span>mm² surface area</span></MagicCard></div><div className="proof-list"><div><strong>Native geometry</strong><span>Built through Replicad and OpenCascade, not a flat visual approximation.</span></div><div><strong>Inspectable decisions</strong><span>Parameters stay close to the model so the next change has context.</span></div><div><strong>Ready to iterate</strong><span>Take the first solid into Studio and keep building from the same intent.</span></div></div></div></section>;
}
