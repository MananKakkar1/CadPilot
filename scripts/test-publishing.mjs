import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function loadRoute(path, modules) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, Response, URL, process: { env: {} }, require: (id) => { assert.ok(id in modules, id); return modules[id]; } });
  return exports;
}

function publishFixture({ valid = true, complete = true, warnings = [], validation = { complete, warnings } } = {}) {
  let update;
  const prisma = {
    revision: { findFirst: async ({ where }) => valid ? { id: where.id, projectId: where.projectId, isValid: true, validation } : null },
    project: { update: async ({ data }) => { update = data; return { id: 'project', ...data }; } },
  };
  return { prisma, get update() { return update; } };
}

test('publishing rejects an incomplete revision and does not mutate visibility', async () => {
  const fixture = publishFixture({ valid: false });
  const route = await loadRoute('app/api/projects/[slug]/publish/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/prisma': { prisma: fixture.prisma },
    '@/lib/projects': { requireProjectOwner: async () => ({ project: { id: 'project' } }) },
  });
  const response = await route.POST(new Request('http://localhost/publish', { method: 'POST', body: JSON.stringify({ revisionId: 'staged' }) }), { params: Promise.resolve({ slug: 'part' }) });
  assert.equal(response.status, 400);
  assert.equal(fixture.update, undefined);
});

test('publishing a completed revision pins that revision and makes the project public', async () => {
  const fixture = publishFixture();
  const route = await loadRoute('app/api/projects/[slug]/publish/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/prisma': { prisma: fixture.prisma },
    '@/lib/projects': { requireProjectOwner: async () => ({ project: { id: 'project' } }) },
  });
  const response = await route.POST(new Request('http://localhost/publish', { method: 'POST', body: JSON.stringify({ revisionId: 'ready' }) }), { params: Promise.resolve({ slug: 'part' }) });
  assert.equal(response.status, 200);
  assert.equal(fixture.update.visibility, 'PUBLIC');
  assert.equal(fixture.update.publishedRevisionId, 'ready');
});

test('publishing rejects a usable revision with unresolved export warnings', async () => {
  const fixture = publishFixture({ complete: false });
  const route = await loadRoute('app/api/projects/[slug]/publish/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/prisma': { prisma: fixture.prisma },
    '@/lib/projects': { requireProjectOwner: async () => ({ project: { id: 'project' } }) },
  });
  const response = await route.POST(new Request('http://localhost/publish', { method: 'POST', body: JSON.stringify({ revisionId: 'warning' }) }), { params: Promise.resolve({ slug: 'part' }) });
  assert.equal(response.status, 400);
  assert.equal(fixture.update, undefined);
});

for (const [name, body, options] of [
  ['missing revision ID', {}, {}],
  ['blank revision ID', { revisionId: ' ' }, {}],
  ['warnings despite complete flag', { revisionId: 'warning' }, { warnings: ['STEP export failed'] }],
  ['legacy validation without completeness', { revisionId: 'legacy' }, { validation: { warnings: [] } }],
  ['null validation', { revisionId: 'legacy' }, { validation: null }],
  ['string completeness flag', { revisionId: 'invalid' }, { validation: { complete: 'true', warnings: [] } }],
  ['missing warnings evidence', { revisionId: 'invalid' }, { validation: { complete: true } }],
  ['malformed warnings evidence', { revisionId: 'invalid' }, { validation: { complete: true, warnings: 'export failed' } }],
]) test(`publishing rejects ${name} without updating the project`, async () => {
  const fixture = publishFixture(options);
  if (!body.revisionId?.trim()) fixture.prisma.revision.findFirst = async () => assert.fail('Invalid input must not query revisions');
  const route = await loadRoute('app/api/projects/[slug]/publish/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/prisma': { prisma: fixture.prisma },
    '@/lib/projects': { requireProjectOwner: async () => ({ project: { id: 'project' } }) },
  });
  const response = await route.POST(new Request('http://localhost/publish', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ slug: 'part' }) });
  assert.equal(response.status, 400);
  assert.equal(fixture.update, undefined);
});

test('unpublishing revokes public visibility and clears the published revision', async () => {
  const fixture = publishFixture();
  const route = await loadRoute('app/api/projects/[slug]/publish/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/prisma': { prisma: fixture.prisma },
    '@/lib/projects': { requireProjectOwner: async () => ({ project: { id: 'project' } }) },
  });
  const response = await route.DELETE(new Request('http://localhost/publish', { method: 'DELETE' }), { params: Promise.resolve({ slug: 'part' }) });
  assert.equal(response.status, 200);
  assert.equal(fixture.update.visibility, 'PRIVATE');
  assert.equal(fixture.update.publishedRevisionId, null);
});

function publicArtifactFixture({ artifact = true } = {}) {
  let reads = 0;
  const prisma = {
    project: { findFirst: async () => ({ publishedRevisionId: 'published' }) },
    artifact: { findFirst: async ({ where }) => {
      assert.equal(where.revisionId, 'published');
      assert.equal(where.revision.isValid, true);
      return artifact ? { filename: 'model.step', mimeType: 'application/step', storageKey: 'published/model.step' } : null;
    } },
  };
  return { prisma, read: async () => { reads += 1; return new Uint8Array(Buffer.from('STEP DATA')); }, get reads() { return reads; } };
}

test('public artifact route never reads or serves an unpublished artifact', async () => {
  const fixture = publicArtifactFixture({ artifact: false });
  const route = await loadRoute('app/api/public/projects/[slug]/artifacts/[id]/route.ts', {
    'node:fs/promises': { readFile: fixture.read },
    'node:path': { join: (...parts) => parts.join('/') },
    '@/lib/prisma': { prisma: fixture.prisma },
  });
  const response = await route.GET(new Request('http://localhost/api/public/projects/part/artifacts/private'), { params: Promise.resolve({ slug: 'part', id: 'private' }) });
  assert.equal(response.status, 404);
  assert.equal(fixture.reads, 0);
});

test('public artifact route serves only the published validated revision', async () => {
  const fixture = publicArtifactFixture();
  const route = await loadRoute('app/api/public/projects/[slug]/artifacts/[id]/route.ts', {
    'node:fs/promises': { readFile: fixture.read },
    'node:path': { join: (...parts) => parts.join('/') },
    '@/lib/prisma': { prisma: fixture.prisma },
  });
  const response = await route.GET(new Request('http://localhost/api/public/projects/part/artifacts/published'), { params: Promise.resolve({ slug: 'part', id: 'published' }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/step');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('content-disposition'), 'attachment; filename="model.step"');
  assert.equal(await response.text(), 'STEP DATA');
  assert.equal(fixture.reads, 1);
});

test('a download after revocation returns 404 without reading storage', async () => {
  const fixture = publicArtifactFixture();
  let published = true;
  fixture.prisma.project.findFirst = async ({ where }) => {
    assert.equal(where.visibility, 'PUBLIC');
    return published ? { publishedRevisionId: 'published' } : null;
  };
  const route = await loadRoute('app/api/public/projects/[slug]/artifacts/[id]/route.ts', {
    'node:fs/promises': { readFile: fixture.read },
    'node:path': { join: (...parts) => parts.join('/') },
    '@/lib/prisma': { prisma: fixture.prisma },
  });
  const request = new Request('http://localhost/api/public/projects/part/artifacts/published');
  const params = { params: Promise.resolve({ slug: 'part', id: 'published' }) };
  assert.equal((await route.GET(request, params)).status, 200);
  published = false;
  const denied = await route.GET(request, params);
  assert.equal(denied.status, 404);
  assert.equal(denied.headers.get('cache-control'), 'private, no-store');
  assert.equal(fixture.reads, 1);
});
