import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Params = { teeth: number; module: number; bore: number; thickness: number };

const initialPrompt = 'Create a spur gear with 20 teeth, module 2, a 10mm bore, and 5mm thickness.';
const presets: Record<string, { prompt: string; params: Params }> = {
  'Low-profile gear': {
    prompt: 'Create a low-profile spur gear with 28 teeth, module 1.5, a 12mm bore, and 4mm thickness.',
    params: { teeth: 28, module: 1.5, bore: 12, thickness: 4 },
  },
  'Phone stand': {
    prompt: 'Create a phone stand with a 65 degree support angle and a cable cutout.',
    params: { teeth: 12, module: 2, bore: 10, thickness: 8 },
  },
};

function App() {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [params, setParams] = useState<Params>({ teeth: 20, module: 2, bore: 10, thickness: 5 });
  const [activeTab, setActiveTab] = useState<'Parameters' | 'Graph' | 'Score'>('Parameters');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastAction, setLastAction] = useState('Ready to build');

  const derived = useMemo(() => ({
    pitch: params.teeth * params.module,
    outer: params.teeth * params.module + 2 * params.module,
    score: Math.max(71, Math.min(98, 96 - Math.max(0, params.bore - params.module * params.teeth * 0.45))),
  }), [params]);

  const setParam = (key: keyof Params, value: number) => {
    setParams((current) => ({ ...current, [key]: value }));
    setLastAction('Parameter changed · rebuild pending');
  };

  const generate = () => {
    setIsGenerating(true);
    setLastAction('Parsing intent · building solid');
    window.setTimeout(() => {
      setIsGenerating(false);
      setLastAction('Solid rebuilt · evaluation complete');
    }, 650);
  };

  const applyPreset = (name: string) => {
    const preset = presets[name];
    setPrompt(preset.prompt);
    setParams(preset.params);
    setLastAction(`${name} loaded`);
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✳</span><span>Agentic CAD</span></div>
        <div className="project-meta"><span className="status-dot" /> Draft workspace <span className="divider" /> v0.1</div>
        <div className="topbar-actions"><span className="sync-state">{lastAction}</span><button className="export-button">Export STEP <span>↗</span></button></div>
      </header>
      <section className="workspace">
        <aside className="sidebar">
          <div className="eyebrow">DESIGN BRIEF <span>01</span></div>
          <h1>Describe a part.<br /><em>Build the system.</em></h1>
          <p className="lede">Generate editable CAD from intent, then tune the parameters like an engineer.</p>
          <label className="field-label" htmlFor="prompt">PROMPT <span>⌘ ↵</span></label>
          <textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <button className={`generate-button ${isGenerating ? 'is-generating' : ''}`} onClick={generate} disabled={isGenerating}>
            <span>{isGenerating ? 'Building solid' : 'Generate design'}</span><span className="button-arrow">{isGenerating ? '◌' : '→'}</span>
          </button>
          <div className="presets">
            <div className="field-label">STARTING POINTS</div>
            {Object.keys(presets).map((name) => <button key={name} onClick={() => applyPreset(name)}>{name}<span>↗</span></button>)}
          </div>
          <div className="sidebar-footer"><span className="live-dot" /> Local geometry engine <span className="footer-version">Replicad</span></div>
        </aside>
        <section className={`viewport ${isGenerating ? 'is-building' : ''}`} aria-label="CAD viewport">
          <div className="viewport-toolbar"><span>SPUR GEAR / LIVE SOLID</span><span><i className="toolbar-dot" /> OPEN CASCADE · READY</span></div>
          <div className="viewport-center-label">{isGenerating ? 'RECOMPUTING' : 'PARAMETRIC PREVIEW'}</div>
          <div className="grid-plane" />
          <div className="model-halo" />
          <div className="gear-placeholder" aria-hidden="true"><div className="gear-ring"><div className="gear-hole" /></div></div>
          <div className="viewport-caption"><div><strong>{params.teeth}T · MODULE {params.module.toFixed(1)}</strong><span>Ø {derived.outer.toFixed(1)} mm outer diameter</span></div><span>Orbit to inspect · Scroll to zoom</span></div>
        </section>
        <aside className="inspector">
          <div className="tabs">{(['Parameters', 'Graph', 'Score'] as const).map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
          {activeTab === 'Parameters' && <div className="inspector-section parameter-section"><div className="section-heading">GEAR PARAMETERS <span>↗</span></div>
            <Parameter label="Teeth" value={`${params.teeth}`} min={8} max={60} step={1} current={params.teeth} onChange={(value) => setParam('teeth', value)} />
            <Parameter label="Module" value={`${params.module.toFixed(2)} mm`} min={1} max={5} step={0.1} current={params.module} onChange={(value) => setParam('module', value)} />
            <Parameter label="Bore diameter" value={`${params.bore.toFixed(2)} mm`} min={2} max={24} step={0.5} current={params.bore} onChange={(value) => setParam('bore', value)} />
            <Parameter label="Thickness" value={`${params.thickness.toFixed(2)} mm`} min={2} max={20} step={0.5} current={params.thickness} onChange={(value) => setParam('thickness', value)} />
          </div>}
          {activeTab === 'Graph' && <Graph />}
          {activeTab === 'Score' && <Score score={derived.score} />}
          <div className="inspector-section inspector-footer"><div className="section-heading">BUILD STATUS <span className="healthy">HEALTHY</span></div><div className="status-row"><span>Geometry</span><strong>Valid solid</strong></div><div className="status-row"><span>Pitch diameter</span><strong>{derived.pitch.toFixed(1)} mm</strong></div><div className="status-row"><span>Last build</span><strong>just now</strong></div></div>
        </aside>
      </section>
    </main>
  );
}

function Parameter({ label, value, min, max, step, current, onChange }: { label: string; value: string; min: number; max: number; step: number; current: number; onChange: (value: number) => void }) {
  return <label className="parameter"><span>{label}</span><output>{value}</output><input type="range" min={min} max={max} step={step} value={current} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function Graph() {
  return <div className="inspector-section graph"><div className="section-heading">PARAMETRIC GRAPH <span>6 NODES</span></div>{['Intent', 'Gear parameters', 'Tooth profile', 'Center bore', 'Extrusion', 'Evaluation'].map((node, index) => <div className={`graph-node ${index === 5 ? 'active' : ''}`} key={node}><span className="node-icon">{index === 5 ? '✓' : '·'}</span>{node}<span className="node-line" /></div>)}</div>;
}

function Score({ score }: { score: number }) {
  return <div className="inspector-section score-panel"><div className="section-heading">ENGINEERING SCORE <span>LIVE</span></div><div className="score-number">{score}<small>/100</small></div><div className="score-bar"><span style={{ width: `${score}%` }} /></div><div className="score-row"><span>Geometry validity</span><strong>40 / 40</strong></div><div className="score-row"><span>Specification match</span><strong>29 / 30</strong></div><div className="score-row"><span>Manufacturability</span><strong>{score > 90 ? '18 / 20' : '14 / 20'}</strong></div></div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
