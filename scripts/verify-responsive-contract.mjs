import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../app/codex.css', import.meta.url), 'utf8');
const required = [
  ['mobile breakpoint', /@media \(max-width: 820px\)/],
  ['mobile rail toggle', /\.codex-mobile-toggle\s*\{[^}]*display: inline-flex/s],
  ['mobile rail drawer', /\.codex-sidebar\s*\{[^}]*position: fixed/s],
  ['mobile rail open state', /\.codex-sidebar-open\s*\{[^}]*transform: translateX\(0\)/s],
  ['mobile backdrop', /\.codex-mobile-backdrop\s*\{[^}]*position: fixed/s],
  ['reduced motion', /@media \(prefers-reduced-motion: reduce\)/],
  ['embedded viewport mobile sizing', /\.codex-workspace-chili \.codex-body\s*\{\s*display: block/s],
];
const missing = required.filter(([, pattern]) => !pattern.test(css)).map(([name]) => name);
if (missing.length) throw new Error(`Responsive contract failed: ${missing.join(', ')}`);
console.log(`Responsive contract passed (${required.length} checks).`);
