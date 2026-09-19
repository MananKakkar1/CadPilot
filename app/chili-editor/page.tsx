import { ChiliEditor } from '@/components/cad/chili-editor';

export default async function ChiliEditorPage({ searchParams }: { searchParams: Promise<{ project?: string; revision?: string }> }) {
  const params = await searchParams;
  const projectSlug = params.project ?? null;
  const backHref = projectSlug ? `/projects/${projectSlug}` : '/projects';

  return (
    <main className="chili-editor-shell">
      <header className="agent-topbar">
        <a href={backHref}>← Back to project</a>
        <div>
          <strong>ChiliCAD editor</strong>
          <span>Chili3D · full parametric editing</span>
        </div>
      </header>
      <ChiliEditor projectSlug={projectSlug} parentRevisionId={params.revision ?? null} />
    </main>
  );
}
