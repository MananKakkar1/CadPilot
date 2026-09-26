import Link from 'next/link';
import { SignOutButton } from './sign-out-button';
import { Button } from '@/components/magicui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/magicui/dropdown-menu';
import { ArrowUpRight, Menu, Box } from 'lucide-react';

type AppHeaderUser = {
  email: string;
  username: string;
};

type AppHeaderProps = {
  user?: AppHeaderUser | null;
  /** Optional label for the project currently in view, reserved for pages that render inside a project context. */
  currentProjectTitle?: string;
};

/** Shared brand/nav/account header for utility pages (`/projects`, `/projects/new`, …). */
export function AppHeader({ user, currentProjectTitle }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-primary">
        <Link href="/" className="app-header-brand" aria-label="CadPilot home">
          <Box aria-hidden="true" /> CadPilot
        </Link>
        <nav className="app-header-nav" aria-label="Main navigation">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/chili-editor">CAD editor</Link>
          <Link href="/projects">Projects</Link>
        </nav>
        {currentProjectTitle && <span className="app-header-project">{currentProjectTitle}</span>}
      </div>
      {user ? (
        <div className="app-header-account">
          <Link className="app-header-user" href={`/u/${user.username}`}>{user.username}</Link>
          <SignOutButton />
        </div>
      ) : <div className="app-header-account"><Link className="site-login" href="/sign-in">Sign in</Link><Button asChild><Link href="/sign-up">Get started <ArrowUpRight aria-hidden="true" /></Link></Button></div>}
      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="site-mobile-menu" aria-label="Open navigation"><Menu aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
        <DropdownMenuItem asChild><Link href="/#how-it-works">How it works</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/projects">Projects</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/chili-editor">CAD editor</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href={user ? `/u/${user.username}` : '/sign-in'}>{user ? 'Your profile' : 'Sign in'}</Link></DropdownMenuItem>
      </DropdownMenuContent></DropdownMenu>
    </header>
  );
}
