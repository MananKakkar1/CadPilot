import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth/session';
import { Button } from '@/components/magicui/button';

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) return <main className="project-empty"><h1>Sign in to create CAD projects.</h1><p>Projects keep your design conversation, validated revisions, and publishable files together.</p><Link href="/sign-in"><Button>Sign in</Button></Link><Link href="/sign-up">Create an account</Link></main>;
  const projects = await prisma.project.findMany({ where: { ownerId: user.id }, include: { _count: { select: { revisions: true } } }, orderBy: { updatedAt: 'desc' } });
  return <main className="projects-page"><header><div><p>AGENTIC CAD</p><h1>Your projects</h1></div><Link href="/projects/new"><Button>New project</Button></Link></header><section>{projects.length ? projects.map((project) => <Link href={`/projects/${project.slug}`} className="project-row" key={project.id}><div><strong>{project.title}</strong><span>{project.summary ?? 'No description yet'}</span></div><div>{project._count.revisions} revisions · {project.visibility.toLowerCase()}</div></Link>) : <div className="project-empty"><h2>Start a durable design workspace.</h2><p>Create a project from the AI CAD page, then every prompt becomes an editable revision.</p><Link href="/projects/new"><Button>Create project</Button></Link></div>}</section></main>;
}
