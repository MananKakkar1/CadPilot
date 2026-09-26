'use client';

import { useEffect, useState } from 'react';
import { FileCode2 } from 'lucide-react';
import { File, Folder, Tree } from '@/components/magicui/file-tree';

type Artifact = { id: string; filename: string; kind: string };

export function WorkspaceFilePreview({ artifacts, activeId, onSelect }: { artifacts: Artifact[]; activeId: string | null; onSelect: (id: string) => void }) {
  const [content, setContent] = useState<string | null>(null);
  const active = artifacts.find((artifact) => artifact.id === activeId) ?? artifacts[0];

  useEffect(() => { setContent(null); if (!active) return; fetch(`/api/artifacts/${active.id}?inline=1`).then((response) => response.text()).then(setContent).catch(() => setContent('Preview unavailable.')); }, [active?.id]);
  if (!active) return <p className="codex-muted">No artifacts yet. Build a revision to populate the workspace.</p>;
  const isSvg = active.kind.endsWith('_SVG');
  return <div className="codex-file-workspace"><aside className="codex-file-tree" aria-label="Project files"><Tree initialExpandedItems={['outputs']} initialSelectedId={active.id} indicator><Folder value="outputs" element="outputs">{artifacts.map((artifact) => <File key={artifact.id} value={artifact.id} handleSelect={onSelect}>{artifact.filename}</File>)}</Folder></Tree></aside><section className="codex-file-preview"><header><div><span className="codex-label">FILE PREVIEW</span><h2>{active.filename}</h2></div><a href={`/api/artifacts/${active.id}`} className="codex-file-download">Download</a></header>{isSvg ? <img src={`/api/artifacts/${active.id}?inline=1`} alt={`${active.filename} preview`} /> : content === null ? <p className="codex-muted">Loading preview…</p> : <pre>{content.slice(0, 24000)}</pre>}<div className="codex-file-meta"><FileCode2 size={14} />{active.kind}</div></section></div>;
}
