import Link from 'next/link';
import { ArrowUpRight, Box, FileCheck2, GitBranch } from 'lucide-react';
import { Button } from '@/components/magicui/button';
import { SiteShell } from '@/components/app-shell/site-shell';
import { CadModelVisual } from '@/components/cad/cad-model-visual';
import { generateLandingModel } from '@/components/cad/replicad-server-model';

export const revalidate = 3600;

export default async function Home() {
  const gear = await generateLandingModel('spur-gear');
  return <SiteShell><main>
    <section className="site-hero">
      <p className="site-eyebrow">CADPILOT / PARAMETRIC DESIGN</p>
      <h1>Bring your ideas<br />into <em>three dimensions.</em></h1>
      <p className="site-hero-copy">Describe the part. Build editable geometry. Keep the model, its revisions, and the files you need in one project.</p>
      <div className="site-hero-actions"><Button asChild><Link href="/projects/new">Start a project <ArrowUpRight aria-hidden="true" /></Link></Button><a href="#how-it-works">Explore the workflow</a></div>
      <CadModelVisual priority model="spur-gear" initialResult={gear} eyebrow="GENERATED SOLID / 20-TOOTH SPUR GEAR" />
    </section>
    <div className="site-capabilities"><span><Box size={17} aria-hidden="true" />Real BREP geometry</span><span><GitBranch size={17} aria-hidden="true" />Connected revisions</span><span><FileCheck2 size={17} aria-hidden="true" />Inspectable exports</span></div>
    <section className="site-section" id="how-it-works">
      <div className="site-section-intro"><div><p className="site-eyebrow">FROM BRIEF TO BUILD</p><h2>A shorter path to<br />your next iteration.</h2></div><p>Work from the same project as your design evolves. Review a plan, inspect the geometry, and refine the details.</p></div>
      <ol className="site-steps">
        <li><span className="site-step-number">01 / DESCRIBE</span><h3>Start with the constraints.</h3><p>Give the dimensions, purpose, and features. Use plan mode when you want to review the approach before building.</p></li>
        <li><span className="site-step-number">02 / REFINE</span><h3>Keep the model in view.</h3><p>Inspect the generated solid and edit it in the integrated CAD editor. Save changes as a new revision.</p></li>
        <li><span className="site-step-number">03 / TAKE IT FORWARD</span><h3>Leave with usable files.</h3><p>Review validation findings, download engineering files, or publish a revision to share with others.</p></li>
      </ol>
    </section>
    <section className="site-output-section" id="outputs"><div className="site-section">
      <div className="site-output-copy"><p className="site-eyebrow">MORE THAN A PREVIEW</p><h2>The geometry.<br />And everything behind it.</h2><p>Inspect the source, review the measurements, and choose the export that fits your next step.</p><Button variant="outline" asChild><Link href="/chili-editor">Explore the CAD editor <ArrowUpRight aria-hidden="true" /></Link></Button></div>
      <dl className="site-output-list"><div><dt>Replicad</dt><dd>Parametric source for generated revisions.</dd></div><div><dt>STEP</dt><dd>Engineering geometry for your CAD workflow.</dd></div><div><dt>STL</dt><dd>A mesh export for downstream print preparation.</dd></div><div><dt>Reports</dt><dd>Measurements and validation findings tied to the revision.</dd></div></dl>
    </div></section>
    <section className="site-cta"><p className="site-eyebrow">MAKE YOUR NEXT MOVE</p><h2>What will you build next?</h2><p>Start a project. Bring a brief. Make it tangible.</p><Button asChild><Link href="/projects/new">Create a project <ArrowUpRight aria-hidden="true" /></Link></Button></section>
  </main></SiteShell>;
}
