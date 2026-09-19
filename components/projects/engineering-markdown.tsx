'use client';

import { useEffect, useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

function MermaidDiagram({ source }: { source: string }) {
  const id = `mermaid-${useId().replace(/:/g, '')}`;
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: { primaryColor: '#eef2ff', primaryTextColor: '#1e1b4b', primaryBorderColor: '#4f46e5', lineColor: '#06b6d4', fontFamily: 'ui-sans-serif, system-ui' } });
      try { const rendered = await mermaid.render(id, source); if (active) setSvg(rendered.svg); }
      catch { if (active) setError('This diagram could not be rendered.'); }
    });
    return () => { active = false; };
  }, [id, source]);
  if (error) return <pre className="engineering-code">{error}\n{source}</pre>;
  return <div className="engineering-mermaid" aria-label="Engineering diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function EngineeringMarkdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{
    code({ className, children: codeChildren, ...props }) {
      const source = String(codeChildren).replace(/\n$/, '');
      if (className === 'language-mermaid') return <MermaidDiagram source={source} />;
      return <code className={className} {...props}>{codeChildren}</code>;
    },
    pre({ children: preChildren }) { return <pre className="engineering-code">{preChildren}</pre>; },
    table({ children: tableChildren }) { return <div className="engineering-table"><table>{tableChildren}</table></div>; },
  }}>{children}</ReactMarkdown>;
}
