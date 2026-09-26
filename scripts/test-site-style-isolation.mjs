import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import postcss from 'postcss';

test('non-workspace redesign has no global CSS selectors', async () => {
  const css = await readFile(new URL('../components/app-shell/site-shell.module.css', import.meta.url), 'utf8');
  postcss.parse(css).walkRules(rule => {
    for (const selector of rule.selectors) {
      assert.ok(selector.startsWith('.root'), `Unscoped selector: ${selector}`);
    }
  });
});

test('the workspace and global layout do not import the site shell', async () => {
  for (const file of ['app/projects/[slug]/page.tsx', 'components/projects/project-workspace.tsx', 'app/layout.tsx']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /site-shell|auth-layout|app-header/, file);
  }
});
