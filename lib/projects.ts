import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required.');
  return user;
}

export async function requireProjectOwner(slug: string) {
  const user = await requireUser();
  const project = await prisma.project.findFirst({ where: { slug, ownerId: user.id } });
  if (!project) throw new Error('Project not found.');
  return { user, project };
}

export function createProjectSlug(title: string) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'untitled-design';
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
