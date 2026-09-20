import { CadModelVisual } from '@/components/cad/cad-model-visual';
import type { CadModelResult } from '@/components/cad/replicad-models';

const stages = [['01', 'Brief', 'Start with constraints, materials, and the reason the part exists.'], ['02', 'Resolve', 'Translate intent into a sequence of measurable operations.'], ['03', 'Build', 'Generate a real OpenCascade solid you can inspect and edit.'], ['04', 'Carry forward', 'Keep the model, metrics, and decisions ready for the next pass.']];

export function Workflow({ model }: { model: CadModelResult }) {
  return <section className="reference-section workflow" id="how-it-works"><div className="reference-copy"><p className="section-kicker">THE LOOP</p><h2>One brief. A visible chain of decisions.</h2><p>Every output has a reason behind it. Follow the path from a short engineering brief to native geometry.</p><ol className="workflow-map">{stages.map(([number, title, copy]) => <li key={title} className="workflow-stage"><span className="stage-number">{number}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol></div><CadModelVisual model="spur-gear" initialResult={model} className="workflow-model" eyebrow="REPLICAD SOLID / INSPECTION" /></section>;
}
