import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { ArtifactKind } from '@prisma/client';

const source = await readFile(new URL('../app/api/projects/[slug]/chili-import/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

async function importModel(failWrite = false, { volume = 10, area = 20, triangles = [0, 1, 2], parentRevisionId = null, parentOwned = true } = {}) {
  const state = { revision: null, artifacts: [], messages: 0, disposed: 0 };
  const db = {
    $transaction: async (fn) => {
      const before = structuredClone(state);
      try { return await fn(db); } catch (error) { Object.assign(state, before); throw error; }
    },
    project: { update: async () => {} },
    revision: {
      findFirst: async ({ where }) => {
        assert.equal(where.projectId, 'project');
        assert.equal(where.isValid, true);
        return parentOwned ? { id: where.id } : null;
      },
      aggregate: async () => ({ _max: { revisionNumber: 4 } }),
      create: async ({ data }) => (state.revision = { ...data, id: 'revision' }),
      update: async ({ data }) => Object.assign(state.revision, data),
    },
    artifact: {
      upsert: async ({ create }) => { assert.equal(state.revision.isValid, false); state.artifacts.push(create); },
      findMany: async () => state.artifacts,
    },
    chatMessage: { create: async () => { assert.equal(state.artifacts.length, 5); state.messages++; } },
  };
  const modules = {
    'node:fs/promises': { mkdir: async () => {}, writeFile: async () => { if (failWrite) throw new Error('Disk full'); } },
    'node:path': { join: (...parts) => parts.join('/') },
    '@prisma/client': { ArtifactKind },
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/prisma': { prisma: db },
    '@/lib/projects': { requireProjectOwner: async () => ({ project: { id: 'project' } }) },
    replicad: {
      setOC: () => {}, measureVolume: () => volume, measureArea: () => area,
      importSTEP: async () => ({ delete: () => { state.disposed++; }, mesh: () => ({ triangles }), boundingBox: { bounds: [[0, 0, 0], [1, 1, 1]] }, blobSTL: () => new Blob(['stl']) }),
    },
    'replicad-opencascadejs': { default: async () => ({}) },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (id) => { assert.ok(id in modules, id); return modules[id]; }, process: { env: {} }, Blob, Uint8Array, TextEncoder });
  const response = await exports.POST(new Request('http://localhost/import', { method: 'POST', body: JSON.stringify({ step: 'STEP', parentRevisionId }) }), { params: Promise.resolve({ slug: 'part' }) });
  return { state, response };
}

test('manual import becomes ready only after five artifacts are stored', async () => {
  const { state, response } = await importModel();
  assert.equal(response.status, 201);
  assert.equal(state.revision.isValid, true);
  assert.equal(state.revision.revisionNumber, 5);
  assert.equal(state.messages, 1);
  assert.equal(state.disposed, 1);
});

test('workbench save targets the existing import endpoint and sends provenance', async () => {
  const workbench = await readFile(new URL('../components/cad/cad-workbench.tsx', import.meta.url), 'utf8');
  assert.match(workbench, /const savePath = `\/api\/projects\/\$\{projectSlug\}\/chili-import`/);
  assert.match(workbench, /JSON\.stringify\(\{ step: data\.step, parentRevisionId \}\)/);
  assert.doesNotMatch(workbench, /viewport-save/);
});

test('manual workbench save preserves its parent in a new revision', async () => {
  const { state, response } = await importModel(false, { parentRevisionId: 'base-revision' });
  assert.equal(response.status, 201);
  assert.equal(state.revision.parentId, 'base-revision');
  assert.equal(state.revision.revisionNumber, 5);
});

test('manual workbench save rejects a parent outside the project', async () => {
  const { state, response } = await importModel(false, { parentRevisionId: 'foreign-revision', parentOwned: false });
  assert.equal(response.status, 400);
  assert.equal(state.revision, null);
  assert.equal(state.artifacts.length, 0);
});

test('manual import storage failure cannot publish a ready revision or result message', async () => {
  const { state, response } = await importModel(true);
  assert.equal(response.status, 400);
  assert.equal(state.revision.isValid, false);
  assert.equal(state.messages, 0);
  assert.equal(state.disposed, 1);
});

for (const [name, geometry] of [
  ['empty mesh', { triangles: [] }],
  ['incomplete triangle', { triangles: [0, 1] }],
  ['zero area', { area: 0 }],
  ['non-finite volume', { volume: Infinity }],
  ['zero volume', { volume: 0 }],
]) test(`manual import rejects ${name} before storing a revision and releases the shape`, async () => {
  const { state, response } = await importModel(false, geometry);
  assert.equal(response.status, 400);
  assert.equal(state.revision, null);
  assert.equal(state.artifacts.length, 0);
  assert.equal(state.disposed, 1);
});

test('manual import preserves small positive measurements', async () => {
  const { state, response } = await importModel(false, { volume: 0.001, area: 0.06 });
  assert.equal(response.status, 201);
  assert.equal(state.revision.metrics.volume, 0.001);
  assert.equal(state.revision.validation.complete, true);
  assert.equal(state.disposed, 1);
});
