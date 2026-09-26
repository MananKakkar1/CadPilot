import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteShell } from '@/components/app-shell/site-shell';
import { prisma } from '@/lib/prisma';
import { ProfileAvatar } from '@/components/projects/profile-avatar';

export default async function CreatorProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await prisma.user.findUnique({ where: { username }, include: { profile: true, projects: { where: { visibility: 'PUBLIC' }, include: { publishedRevision: true }, orderBy: { updatedAt: 'desc' } } } });
  if (!user) notFound();
  const displayName = user.profile?.displayName ?? user.username;
  return <SiteShell><main className="projects-page"><header className="profile-header"><ProfileAvatar avatarUrl={user.profile?.avatarUrl} label={displayName} /><div><p className="site-eyebrow">CREATOR PROFILE</p><h1>{displayName}</h1><span>{user.profile?.bio ?? 'Building editable CAD systems with CadPilot.'}</span></div></header><section>{user.projects.length ? user.projects.map((project) => <Link href={`/p/${project.slug}`} className="project-row" key={project.id}><div><strong>{project.title}</strong><span>{project.summary ?? 'Validated parametric CAD project'}</span></div><div>Revision {project.publishedRevision?.revisionNumber}</div></Link>) : <div className="project-empty"><h2>No published projects yet.</h2><p>{displayName} hasn&apos;t published a public project yet. Check back soon.</p></div>}</section></main></SiteShell>;
}
