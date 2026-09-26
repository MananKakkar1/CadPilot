import { CadWorkbench } from '@/components/cad/cad-workbench';
import { Button } from '@/components/magicui/button';
import Link from 'next/link';
import { SiteShell } from '@/components/app-shell/site-shell';

export default function ChiliEditorPage() {
  return (
    <SiteShell footer={false}><main className="cad-workbench-page">
      <header className="cad-workbench-header">
        <Button asChild variant="ghost" size="sm"><Link href={backHref}>← Projects</Link></Button>
        <strong>CadPilot</strong>
        <span>Workbench</span>
      </header>
      <CadWorkbench projectSlug={projectSlug} parentRevisionId={params.revision ?? null} />
    </main></SiteShell>
  );
}
