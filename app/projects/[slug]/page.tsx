import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireProjectOwner } from '@/lib/projects';
import { ProjectWorkspace } from '@/components/projects/project-workspace';

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const { project } = await requireProjectOwner(slug);
    const detail = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { revisions: { include: { artifacts: true }, orderBy: { revisionNumber: 'desc' } }, jobs: { include: { events: { orderBy: { sequence: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 1 }, conversations: { include: { messages: { orderBy: { createdAt: 'asc' } } } } } });
    return <ProjectWorkspace initialProject={JSON.parse(JSON.stringify(detail))} />;
  } catch { notFound(); }
}
