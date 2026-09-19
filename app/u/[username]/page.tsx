import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export default async function CreatorProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await prisma.user.findUnique({ where: { username }, include: { profile: true, projects: { where: { visibility: 'PUBLIC' }, include: { publishedRevision: true }, orderBy: { updatedAt: 'desc' } } } });
  if (!user) notFound();
  return <main className="projects-page"><header><div><p>CREATOR PROFILE</p><h1>{user.profile?.displayName ?? user.username}</h1><span>{user.profile?.bio ?? 'Building editable CAD systems with Agentic CAD.'}</span></div></header><section>{user.projects.map((project) => <Link href={`/p/${project.slug}`} className="project-row" key={project.id}><div><strong>{project.title}</strong><span>{project.summary ?? 'Validated parametric CAD project'}</span></div><div>Revision {project.publishedRevision?.revisionNumber}</div></Link>)}</section></main>;
}
