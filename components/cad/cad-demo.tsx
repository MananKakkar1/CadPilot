'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/magicui/button';
import { Badge } from '@/components/magicui/badge';
import { Slider } from '@/components/magicui/slider';
import { TooltipHint as Tooltip } from '@/components/magicui/tooltip';
import type { CadModelId, CadModelParams, CadModelResult, CadModelValues } from './replicad-models';
import { defaultCadValues, labelForModel } from './replicad-models';
import { createViewer, type Viewer } from './viewer-kit';

function Scene({ result }: { result: CadModelResult | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
  const toParts = (value: CadModelResult | null) => (value ? [{ mesh: value.mesh, color: 0xe56e46 }] : []);

  useEffect(() => {
    let disposed = false;
    if (!canvasRef.current) return;
    createViewer(canvasRef.current, { interactive: true, autoRotate: true }).then((viewer) => {
      if (disposed) return viewer.dispose();
      viewerRef.current = viewer;
      viewer.setParts(toParts(resultRef.current));
    });
    return () => {
      disposed = true;
      viewerRef.current?.dispose();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewerRef.current?.setParts(toParts(result));
  }, [result]);

  return <div className="cad-scene"><canvas ref={canvasRef} /><div className="scene-grid" /><span className="scene-axis scene-axis-x">X</span><span className="scene-axis scene-axis-y">Y</span></div>;
}

export function CadDemo() {
  const [model,setModel] = useState<CadModelId>('spur-gear'); const [values,setValues] = useState<CadModelValues>(defaultCadValues); const [result,setResult] = useState<CadModelResult|null>(null); const worker = useRef<Worker|null>(null); const requestId = useRef(0);
  useEffect(() => { const nextWorker = new Worker(new URL('./cad-worker.ts',import.meta.url)); worker.current=nextWorker; nextWorker.onmessage=(event: MessageEvent<{id:number;result:CadModelResult}>)=>setResult(event.data.result); return () => nextWorker.terminate(); }, []);
  useEffect(() => { const params: CadModelParams={model,values}; worker.current?.postMessage({id:++requestId.current,params}); }, [model,values]);
  const setValue = (key: keyof CadModelValues,value:number) => setValues((current)=>({...current,[key]:value})); const gear=model==='spur-gear';
  return <div className="cad-demo" id="demo"><div className="demo-toolbar"><div><Badge>LIVE GEOMETRY</Badge><span className="demo-kicker">Replicad / OpenCascade</span></div><div className="demo-actions"><Tooltip label="Export is part of Studio"><Button variant="ghost" disabled>Export STEP</Button></Tooltip><Button variant="ghost" disabled>Export STL</Button></div></div><div className="demo-grid"><div className="demo-canvas"><Scene result={result}/><div className="canvas-label canvas-label-top">{labelForModel(model).toUpperCase()} / PREVIEW</div><div className="canvas-label canvas-label-bottom"><span><i className="status-dot"/> {result?.label??'Building mesh'}</span><span>Drag to orbit · Right-drag to pan · Scroll to zoom</span></div></div><aside className="demo-controls"><div className="control-header"><span>MODEL</span><strong>{gear?'01':'02'}</strong></div><div className="model-switcher"><button className={gear?'active':''} onClick={()=>setModel('spur-gear')}>Spur gear <span>↗</span></button><button className={!gear?'active':''} onClick={()=>setModel('phone-stand')}>Phone stand <span>↗</span></button></div><div className="control-header control-header-spaced"><span>PARAMETERS</span><strong>LIVE</strong></div>{gear?<><Control label="Teeth" value={values.teeth} min={8} max={40} step={1} onChange={(value)=>setValue('teeth',value)}/><Control label="Module" value={values.module} min={1} max={4} step={.1} suffix="mm" onChange={(value)=>setValue('module',value)}/><Control label="Bore" value={values.bore} min={4} max={18} step={.5} suffix="mm" onChange={(value)=>setValue('bore',value)}/><Control label="Thickness" value={values.thickness} min={2} max={12} step={.5} suffix="mm" onChange={(value)=>setValue('thickness',value)}/></>:<><Control label="Tilt" value={values.tilt} min={45} max={82} step={1} suffix="°" onChange={(value)=>setValue('tilt',value)}/><Control label="Width" value={values.width} min={48} max={100} step={1} suffix="mm" onChange={(value)=>setValue('width',value)}/><Control label="Height" value={values.height} min={60} max={130} step={1} suffix="mm" onChange={(value)=>setValue('height',value)}/></>}<div className="metric-row"><span>Geometry status</span><strong><i className="status-dot"/> Valid solid</strong></div><div className="metric-row"><span>Volume</span><strong>{result?.metrics.volume??'—'} mm³</strong></div><div className="metric-row"><span>Surface area</span><strong>{result?.metrics.surfaceArea??'—'} mm²</strong></div><Button className="reset-button" variant="outline" onClick={()=>setValues(defaultCadValues)}>Reset parameters <span>↺</span></Button></aside></div></div>;
}
function Control({label,value,min,max,step,suffix='',onChange}:{label:string;value:number;min:number;max:number;step:number;suffix?:string;onChange:(value:number)=>void}) { return <label className="cad-control"><span>{label}<output>{value.toFixed(step<1?1:0)}{suffix}</output></span><Slider min={min} max={max} step={step} value={[value]} onValueChange={(nextValue)=>onChange(nextValue[0] ?? value)}/></label>; }
