import type { ReactNode } from 'react';
import Link from 'next/link';
import { AppHeader } from './app-header';
import styles from './site-shell.module.css';

/** Route-owned composition. Never wrap the project workspace in this shell. */
export function SiteShell({ children, user, className = '', footer = true }: {
  children: ReactNode;
  user?: { email: string; username: string } | null;
  className?: string;
  footer?: boolean;
}) {
  return <div className={`${styles.root} ${className}`}>
    <AppHeader user={user} />
    {children}
    {footer && <footer className="site-footer"><Link href="/" className="site-wordmark">CadPilot<span>®</span></Link><p>From design intent to editable geometry.</p><nav aria-label="Footer"><Link href="/projects">Projects</Link><Link href="/chili-editor">CAD editor</Link><Link href="/sign-in">Sign in</Link></nav><small>© {new Date().getFullYear()} CadPilot</small></footer>}
  </div>;
}
