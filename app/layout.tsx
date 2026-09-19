import type { Metadata } from 'next';
import './globals.css';
import './brand.css';
import './tailwind.css';
import './landing.css';
import './magic-overrides.css';
import './reference.css';
import './chili-editor.css';
import './agent-workspace.css';
import './project-viewport.css';
import './auth.css';
import 'katex/dist/katex.min.css';
import './chili-editor.css';

export const metadata: Metadata = {
  title: 'Agentic CAD — Design by intent',
  description: 'Describe the part. Build the system. Parametric CAD for engineering teams.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
