#!/usr/bin/env node
// Rebuilds public/chili3d/ from the upstream Chili3D source.
//
// public/chili3d/ is a vendored, unmodified production build of
// https://github.com/xiangechen/chili3d (AGPL-3.0) checked into this repo so the /chili-editor
// page works with no extra setup. Run this script to update it to a newer commit, or after
// deleting public/chili3d/ to regenerate it from scratch.
//
// Usage: node scripts/build-chili3d.mjs [commit-ish]
// Defaults to the commit pinned in public/chili3d/CHILI3D_NOTICE.md.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_COMMIT = '03a6a542e841a7f1952f67aa729e0658a8096c08';
const REPO_URL = 'https://github.com/xiangechen/chili3d.git';
const commit = process.argv[2] ?? DEFAULT_COMMIT;

function run(command, args, cwd, extraEnv) {
  console.log(`$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });
}

const work = mkdtempSync(join(tmpdir(), 'chili3d-build-'));
try {
  console.log(`Cloning chili3d @ ${commit} into ${work}`);
  run('git', ['clone', REPO_URL, work]);
  run('git', ['checkout', commit], work);
  run('npm', ['install', '--no-audit', '--no-fund'], work);
  run('npx', ['rspack', 'build'], work, { NODE_ENV: 'production' });

  const distDir = join(work, 'dist');
  const targetDir = join(ROOT, 'public', 'chili3d');
  rmSync(targetDir, { recursive: true, force: true });
  cpSync(distDir, targetDir, { recursive: true });
  cpSync(join(work, 'LICENSE'), join(targetDir, 'LICENSE'));

  // Drop the upstream analytics snippet and point at our theme override, same patch as
  // documented in CHILI3D_NOTICE.md — no other change to the generated shell.
  const indexPath = join(targetDir, 'index.html');
  let html = readFileSync(indexPath, 'utf8');
  html = html.replace(/<script>!function\(t,e,n,c,r,a,i\).*?<\/script>/s, '');
  html = html.replace(
    '<link href="main.css" rel="stylesheet">',
    '<link href="main.css" rel="stylesheet"><link href="/chili3d-bridge/theme-override.css" rel="stylesheet">',
  );
  writeFileSync(indexPath, html);

  const buildDate = new Date().toISOString().slice(0, 10);
  writeFileSync(
    join(targetDir, 'CHILI3D_NOTICE.md'),
    `# Chili3D (vendored build)

This directory contains an unmodified production build of [Chili3D](${REPO_URL.replace('.git', '')}),
a browser-based 3D CAD application, licensed under the GNU AGPL-3.0 (see \`LICENSE\` in this folder).

- Source: ${REPO_URL.replace('.git', '')}
- Commit: \`${commit}\`
- Built: ${buildDate}, via \`npm install && rspack build\` from the upstream source, no source changes.

The only modification made to this build's output is \`index.html\`, where the upstream
Microsoft Clarity analytics snippet was removed and a stylesheet link to
\`/chili3d-bridge/theme-override.css\` was added, so the embedded editor doesn't silently phone
home to a third-party analytics service and matches this site's visual theme. No application
code or WASM binary was changed.

Rebuild this directory at any time with:

\`\`\`bash
node scripts/build-chili3d.mjs
\`\`\`

The \`agentic-cad-bridge\` plugin loaded via \`?plugin=\` at runtime (see \`/chili3d-bridge/plugins/agentic-cad-bridge\`)
is original code written for this project, kept outside this vendored directory so it survives a rebuild.
`,
  );

  console.log(`\nDone. public/chili3d/ rebuilt from commit ${commit}.`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
