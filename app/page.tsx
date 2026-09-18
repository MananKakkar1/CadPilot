'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';

type Params = { teeth: number; module: number; bore: number; thickness: number };
type Tab = 'parameters' | 'graph' | 'score';

const initialPrompt = 'Create a spur gear with 20 teeth, module 2, a 10mm bore, and 5mm thickness.';

const presets: Record<string, { prompt: string; params: Params }> = {
  'Precision gear': { prompt: initialPrompt, params: { teeth: 20, module: 2, bore: 10, thickness: 5 } },
  'Low-profile gear': { prompt: 'Create a low-profile gear with 28 teeth, module 1.5, a 12mm bore, and 4mm thickness.', params: { teeth: 28, module: 1.5, bore: 12, thickness: 4 } },
  'Phone stand': { prompt: 'Create a phone stand with a 65 degree support angle and a cable cutout.', params: { teeth: 12, module: 2, bore: 10, thickness: 8 } },
};

export default function Home() {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [params, setParams] = useState<Params>(presets['Precision gear'].params);
  const [selectedPreset, setSelectedPreset] = useState('Precision gear');
  const [tab, setTab] = useState<Tab>('parameters');
  const [building, setBuilding] = useState(false);
  const [status, setStatus] = useState('Ready to build');

  const metrics = useMemo(() => ({
    pitch: params.teeth * params.module,
    outer: params.teeth * params.module + 2 * params.module,
    score: Math.round(Math.max(71, Math.min(98, 96 - Math.max(0, params.bore - params.module * params.teeth * 0.45)))),
  }), [params]);

  function updateParam(key: keyof Params, value: number) {
    setParams((current) => ({ ...current, [key]: value }));
    setStatus('Parameter changed · rebuild pending');
  }

  function generate() {
    setBuilding(true);
    setStatus('Parsing intent · building solid');
    window.setTimeout(() => {
      setBuilding(false);
      setStatus('Solid rebuilt · evaluation complete');
    }, 650);
  }

  function choosePreset(name: string) {
    setSelectedPreset(name);
    setPrompt(presets[name].prompt);
    setParams(presets[name].params);
    setStatus(`${name} loaded`);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Agentic CAD home"><Image src="/brand/agentic-cad-logo.svg" alt="Agentic CAD" width={240} height={64} priority className="brand-logo" /></a>
        <div className="workspace-meta"><span className="online-dot" /> Draft workspace <span className="meta-rule" /> v0.1</div>
        <div className="topbar-end"><span className="build-status">{status}</span><button className="secondary-button">Export STEP <span>↗</span></button></div>
      </header>

      <section className="workspace" id="top">
        <aside className="brief-panel panel-enter panel-enter-1">
          <div className="overline">DESIGN BRIEF <span>01</span></div>
          <h1>Describe a part.<br /><i>Build the system.</i></h1>
          <p className="lede">Generate editable geometry from intent, then tune the system like an engineer.</p>

          <label className="field-label" htmlFor="brief">PROMPT <span>⌘ ↵</span></label>
          <textarea id="brief" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <button className={`primary-button ${building ? 'is-building' : ''}`} onClick={generate} disabled={building}><span>{building ? 'Building solid' : 'Generate design'}</span><b>{building ? '◌' : '→'}</b></button>

          <div className="preset-list"><div className="field-label">STARTING POINTS</div>{Object.keys(presets).map((name) => <button className={selectedPreset === name ? 'selected' : ''} key={name} onClick={() => choosePreset(name)}><span>{name}</span><b>↗</b></button>)}</div>
          <div className="engine-note"><span className="engine-note-brand"><Image src="/brand/agentic-cad-mark.svg" alt="" width={15} height={15} className="engine-logo" />Local geometry engine</span><em>Replicad</em></div>
        </aside>

        <section className={`viewport panel-enter panel-enter-2 ${building ? 'is-building' : ''}`} aria-label="CAD viewport">
          <div className="viewport-meta"><span>SPUR GEAR / LIVE SOLID</span><span><i className="online-dot" /> OPEN CASCADE · READY</span></div>
          <div className="viewport-watermark">PARAMETRIC PREVIEW</div>
          <div className="construction-grid" />
          <div className="model-glow" />
          <div className="gear-stage" aria-hidden="true"><div className="gear"><div className="gear-bore" /></div></div>
          <div className="viewport-footer"><div><strong>{params.teeth}T · MODULE {params.module.toFixed(1)}</strong><span>Ø {metrics.outer.toFixed(1)} mm outer diameter</span></div><span>Orbit to inspect · Scroll to zoom</span></div>
        </section>

        <aside className="inspector panel-enter panel-enter-3">
          <nav className="tabs" aria-label="Inspector views">{(['parameters', 'graph', 'score'] as Tab[]).map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)}>{item}</button>)}</nav>
          {tab === 'parameters' && <Parameters params={params} onChange={updateParam} />}
          {tab === 'graph' && <Graph />}
          {tab === 'score' && <Score score={metrics.score} />}
          <div className="inspector-status"><div className="section-title">BUILD STATUS <span className="healthy">HEALTHY</span></div><div className="status-line"><span>Geometry</span><strong>Valid solid</strong></div><div className="status-line"><span>Pitch diameter</span><strong>{metrics.pitch.toFixed(1)} mm</strong></div><div className="status-line"><span>Last build</span><strong>just now</strong></div></div>
        </aside>
      </section>
      <footer className="site-footer"><Image src="/brand/agentic-cad-logo.svg" alt="Agentic CAD" width={240} height={64} className="brand-logo" /><span>Design intent → editable geometry.</span><span>© 2026 Agentic CAD</span></footer>
    </main>
  );
}

function Parameters({ params, onChange }: { params: Params; onChange: (key: keyof Params, value: number) => void }) {
  return <div className="inspector-section"><div className="section-title">GEAR PARAMETERS <span>↗</span></div><Parameter label="Teeth" value={`${params.teeth}`} current={params.teeth} min={8} max={60} step={1} onChange={(value) => onChange('teeth', value)} /><Parameter label="Module" value={`${params.module.toFixed(2)} mm`} current={params.module} min={1} max={5} step={.1} onChange={(value) => onChange('module', value)} /><Parameter label="Bore diameter" value={`${params.bore.toFixed(2)} mm`} current={params.bore} min={2} max={24} step={.5} onChange={(value) => onChange('bore', value)} /><Parameter label="Thickness" value={`${params.thickness.toFixed(2)} mm`} current={params.thickness} min={2} max={20} step={.5} onChange={(value) => onChange('thickness', value)} /></div>;
}

function Parameter({ label, value, current, min, max, step, onChange }: { label: string; value: string; current: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="parameter"><span>{label}</span><output>{value}</output><input type="range" value={current} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Graph() {
  return <div className="inspector-section"><div className="section-title">PARAMETRIC GRAPH <span>6 NODES</span></div><div className="graph-list">{['Intent', 'Gear parameters', 'Tooth profile', 'Center bore', 'Extrusion', 'Evaluation'].map((node, index) => <div className={`graph-node ${index === 5 ? 'active' : ''}`} key={node}><span className="node-icon">{index === 5 ? '✓' : '·'}</span>{node}<span className="node-connector" /></div>)}</div></div>;
}

function Score({ score }: { score: number }) {
  return <div className="inspector-section score-panel"><div className="section-title">ENGINEERING SCORE <span>LIVE</span></div><div className="score-number">{score}<small>/100</small></div><div className="score-track"><span style={{ width: `${score}%` }} /></div><div className="score-line"><span>Geometry validity</span><strong>40 / 40</strong></div><div className="score-line"><span>Specification match</span><strong>29 / 30</strong></div><div className="score-line"><span>Manufacturability</span><strong>{score > 90 ? '18 / 20' : '14 / 20'}</strong></div></div>;
}
