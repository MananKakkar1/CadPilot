const signals = [
  ['NATIVE SOLIDS', 'OpenCascade geometry you can inspect and edit.'],
  ['VISIBLE HISTORY', 'Every constraint stays close to the generated part.'],
  ['TEAM READY', 'A shared model language from first brief to revision.'],
];

export function LandingSignals() {
  return <section className="landing-signals" aria-label="Agentic CAD capabilities"><p className="signals-kicker">A CAD workflow built around editable output</p><div className="signals-grid">{signals.map(([title, copy]) => <div key={title} className="signal-card"><span>{title}</span><p>{copy}</p></div>)}</div><div className="signal-proof"><span>GENERATED LOCALLY</span><strong>Editable solids from Replicad and OpenCascade</strong><span>REPLICAD / OPENCASCADE</span></div></section>;
}
