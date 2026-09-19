import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export default async function PublicProject({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await prisma.project.findFirst({ where: { slug, visibility: 'PUBLIC' }, include: { owner: { include: { profile: true } }, publishedRevision: { include: { artifacts: true } } } });
  if (!project?.publishedRevision) notFound();
  return <main className="projects-page"><header><div><p>PUBLISHED CAD PROJECT</p><h1>{project.title}</h1><span>{project.summary}</span><p>By <Link href={`/u/${project.owner.username}`}>{project.owner.profile?.displayName ?? project.owner.username}</Link></p></div></header><section className="project-empty"><h2>Revision {project.publishedRevision.revisionNumber}</h2><p>{project.publishedRevision.isValid ? 'Validated OpenCascade BREP' : 'Pending validation'}</p></section></main>;
}
