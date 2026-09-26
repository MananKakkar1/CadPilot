import type { ReactNode } from 'react';
import { Box, Layers3, FileCheck2 } from 'lucide-react';
import { SiteShell } from '@/components/app-shell/site-shell';

/** Account-page composition; controls remain the existing shadcn components. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return <SiteShell><main className="site-auth-layout"><aside className="site-auth-story"><p className="site-eyebrow">YOUR NEXT DESIGN STARTS HERE</p><h2>Less setup.<br />More <em>making.</em></h2><p>A place for the brief, the model, and every revision in between.</p><ul><li><Box aria-hidden="true" /><span>Editable, parametric geometry</span></li><li><Layers3 aria-hidden="true" /><span>A connected revision history</span></li><li><FileCheck2 aria-hidden="true" /><span>Validation and export files together</span></li></ul><span className="site-auth-footnote">REPLICAD + OPENCASCADE</span></aside><div className="site-auth-form">{children}</div></main></SiteShell>;
}
