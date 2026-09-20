import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { ProjectWorkspace } from '@/components/projects/project-workspace';

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/projects/${slug}`)}`);
  const project = await prisma.project.findFirst({ where: { slug, ownerId: user.id } });
  if (!project) notFound();
  const detail = await prisma.project.findUniqueOrThrow({ where: { id: project.id }, include: { revisions: { include: { artifacts: true }, orderBy: { revisionNumber: 'desc' } }, jobs: { include: { events: { orderBy: { sequence: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 1 }, conversations: { include: { messages: { orderBy: { createdAt: 'asc' } } } }, agentRuns: { include: { steps: { orderBy: { sequence: 'asc' } }, subagents: { orderBy: { createdAt: 'asc' } }, approvals: { orderBy: { createdAt: 'desc' }, take: 3 } }, orderBy: { createdAt: 'desc' }, take: 6 } } });
  return <ProjectWorkspace initialProject={JSON.parse(JSON.stringify(detail))} />;
}
