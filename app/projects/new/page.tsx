import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { NewProject } from '@/components/projects/new-project';
import { SiteShell } from '@/components/app-shell/site-shell';

export default async function NewProjectPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in?next=/projects/new');
  return <SiteShell user={{ email: user.email, username: user.username }}><NewProject /></SiteShell>;
}
