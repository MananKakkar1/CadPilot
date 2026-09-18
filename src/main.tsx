import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✳</span> Agentic CAD</div>
        <div className="project-meta"><span className="status-dot" /> Draft workspace <span className="divider" /> v0.1</div>
        <button className="export-button">Export STEP <span>↗</span></button>
      </header>
      <section className="workspace">
        <aside className="sidebar">
          <div className="eyebrow">DESIGN BRIEF</div>
          <h1>Describe a part.<br /><em>Build the system.</em></h1>
          <p className="lede">Generate editable CAD from intent, then tune the parameters like an engineer.</p>
          <label className="field-label" htmlFor="prompt">PROMPT</label>
          <textarea id="prompt" defaultValue="Create a spur gear with 20 teeth, module 2, a 10mm bore, and 5mm thickness." />
          <button className="generate-button">Generate design <span>→</span></button>
          <div className="presets">
            <div className="field-label">TRY A PRESET</div>
            <button>Low-profile gear <span>↗</span></button>
            <button>Phone stand <span>↗</span></button>
          </div>
        </aside>
        <section className="viewport" aria-label="CAD viewport">
          <div className="viewport-toolbar"><span>SPUR GEAR / LIVE SOLID</span><span>OPEN CASCADE · READY</span></div>
          <div className="grid-plane" />
          <div className="gear-placeholder" aria-hidden="true"><div className="gear-ring"><div className="gear-hole" /></div></div>
          <div className="viewport-caption"><strong>20T · MODULE 2</strong><span>Orbit to inspect · Scroll to zoom</span></div>
        </section>
        <aside className="inspector">
          <div className="tabs"><button className="active">Parameters</button><button>Graph</button><button>Score</button></div>
          <div className="inspector-section"><div className="section-heading">GEAR PARAMETERS <span>↗</span></div>
            <label>Teeth <output>20</output><input type="range" min="8" max="60" defaultValue="20" /></label>
            <label>Module <output>2.00 mm</output><input type="range" min="1" max="5" step="0.1" defaultValue="2" /></label>
            <label>Bore diameter <output>10.00 mm</output><input type="range" min="2" max="24" defaultValue="10" /></label>
            <label>Thickness <output>5.00 mm</output><input type="range" min="2" max="20" defaultValue="5" /></label>
          </div>
          <div className="inspector-section graph"><div className="section-heading">PARAMETRIC GRAPH <span>6 NODES</span></div>
            {['Intent', 'Gear parameters', 'Tooth profile', 'Center bore', 'Extrusion', 'Evaluation'].map((node, index) => <div className={`graph-node ${index === 5 ? 'active' : ''}`} key={node}><span className="node-icon">{index === 5 ? '✓' : '·'}</span>{node}<span className="node-line" /></div>)}
          </div>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
