import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import './design-tokens.css';
import './brand.css';
import './tailwind.css';
import './landing.css';
import './magic-overrides.css';
import './reference.css';
import './chili-editor.css';
import './agent-workspace.css';
import './auth.css';
import 'katex/dist/katex.min.css';
import './ui-quality.css';
import './codex.css';
import './workspace.css';

export const metadata: Metadata = {
  title: 'CadPilot — Design by intent',
  description: 'Describe the part. Build the system. Parametric CAD for engineering teams.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}><body><a className="skip-link" href="#main-content">Skip to content</a><div id="main-content">{children}</div></body></html>;
}
