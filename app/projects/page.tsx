import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { Button } from '@/components/magicui/button';
import { SiteShell } from '@/components/app-shell/site-shell';
import { FolderOpen, Plus } from 'lucide-react';
import { ProjectList, type ProjectRow } from '@/components/projects/project-list';

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user)
    return (
      <SiteShell>
        <div className="projects-page">
        <main className="project-empty">
          <FolderOpen aria-hidden="true" /><p className="site-eyebrow">YOUR DESIGN LIBRARY</p><h1>Your next project<br />starts here.</h1>
          <p>Projects keep your design session, validated revisions, and publishable files together.</p>
          <div className="site-empty-actions"><Button asChild><Link href="/sign-in">Sign in</Link></Button><Link href="/sign-up">Create an account →</Link></div>
        </main></div>
      </SiteShell>
    );

  const projects = await prisma.project.findMany({
    where: { ownerId: user.id },
    include: {
      _count: { select: { revisions: true } },
      revisions: { select: { isValid: true }, orderBy: { createdAt: 'desc' } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const rows: ProjectRow[] = projects.map((project) => ({
    id: project.id,
    slug: project.slug,
    title: project.title,
    summary: project.summary,
    visibility: project.visibility,
    updatedAt: project.updatedAt.toISOString(),
    revisionCount: project._count.revisions,
    hasValidRevision: project.revisions.some((revision) => revision.isValid),
    hasPendingRevision: project.revisions.some((revision) => !revision.isValid),
  }));

  return (
    <SiteShell user={{ email: user.email, username: user.username }}>
      <main className="projects-page">
        <header>
          <div>
            <p className="site-eyebrow">DESIGN LIBRARY</p><h1>Your projects.</h1>
            <span>Design work, agent runs, revisions, and exports.</span>
          </div>
          <Button asChild><Link href="/projects/new"><Plus size={16} aria-hidden="true" /> New project</Link></Button>
        </header>
        <section>
          {rows.length ? (
            <ProjectList projects={rows} />
          ) : (
            <div className="project-empty">
              <FolderOpen aria-hidden="true" /><h2>A home for your next idea.</h2>
              <p>
                Describe what you want to build — a spur gear, a desktop stand, anything mechanical — and every
                prompt becomes an editable, validated revision you can keep iterating on.
              </p>
              <Button asChild><Link href="/projects/new">Create project</Link></Button>
            </div>
          )}
        </section>
      </main>
    </SiteShell>
  );
}
