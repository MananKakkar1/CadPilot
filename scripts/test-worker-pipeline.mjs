import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as lifecycle from '../lib/cad/job-lifecycle.mjs';
import { ArtifactKind, BuildStatus, AgentRunStatus, AgentStepStatus } from '@prisma/client';

const source = await readFile(new URL('./cad-agent-worker.mjs', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.slice(0, source.indexOf('const server = createServer')) + '\nexports.processJob = processJob;', {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
}).outputText;

async function runPipeline(stopAt, { parentId = null, parentAvailable = true, invalidGeometry = false, provider = false } = {}) {
  const state = { status: 'RUNNING', valid: null, artifacts: [], writes: 0, messages: 0, generations: 0, builds: 0 };
  const db = {
    $transaction: async (fn) => fn(db),
    buildJob: {
      findUnique: async ({ where }) => { assert.equal(where.id, 'job'); return { status: state.status }; },
      updateMany: async ({ where, data }) => {
        if (state.status !== where.status) return { count: 0 };
        Object.assign(state, data); return { count: 1 };
      },
      update: async ({ data }) => Object.assign(state, data),
    },
    agentRun: { findUnique: async () => null },
    buildEvent: { aggregate: async () => ({ _max: { sequence: 0 } }), create: async () => {} },
    project: { update: async () => {}, findUnique: async () => ({ title: 'Test part' }) },
    revision: {
      findFirst: async ({ where }) => {
        assert.equal(where.id, parentId);
        assert.equal(where.projectId, 'project');
        assert.equal(where.isValid, true);
        return parentAvailable ? { sourceCode: 'function main(r) { return r.makeBox([0,0,0], [10,10,10]); }' } : null;
      },
      aggregate: async () => ({ _max: { revisionNumber: 0 } }),
      create: async ({ data }) => { state.valid = data.isValid; return { ...data, id: 'revision' }; },
      update: async ({ data }) => { state.valid = data.isValid; },
    },
    artifact: {
      upsert: async ({ create }) => { assert.equal(create.revisionId, 'revision'); state.artifacts.push({ ...create, id: create.kind }); },
      findMany: async () => state.artifacts,
    },
    chatMessage: { create: async () => { state.messages++; } },
  };
  const modules = {
    '@prisma/client': { PrismaClient: function () { return db; }, ArtifactKind, BuildStatus, AgentRunStatus, AgentStepStatus },
    'node:fs/promises': { mkdir: async () => {}, writeFile: async () => {
      state.writes++;
      if (stopAt === 'write-error') throw new Error('disk unavailable');
      if (stopAt === 'write') state.status = 'CANCELLED';
    } },
    'node:fs': { readFileSync: () => { throw new Error('No environment file in test'); } },
    'node:path': { join: (...parts) => parts.join('/') },
    'node:net': {},
    replicad: { setOC: () => {} },
    'replicad-opencascadejs': { default: async () => ({}) },
    '../lib/cad/job-lifecycle.mjs': lifecycle,
    // Real projection is exercised against the live kernel in scripts/test-drawings.mjs; this
    // pipeline test only needs the same artifact fan-out.
    '../lib/cad/blueprint.mjs': { buildBlueprint: () => ({ svg: '<svg/>', dxf: 'DXF', pdf: Buffer.from('PDF'), notes: [], views: [{ id: 'front', label: 'FRONT' }], scaleLabel: '1:1' }) },
    '../lib/cad/sketch.mjs': { buildSketch: () => ({ svg: '<svg/>', dxf: 'DXF', notes: [], views: [{ id: 'section-xy', label: 'SECTION A-A (XY)', kind: 'section' }], scaleLabel: '1:1' }) },
    '../lib/cad/intent.mjs': { inferDesignIntent: (prompt) => ({ object: prompt, units: 'mm', dimensions: {}, constraints: ['valid closed BREP', 'editable dimensions'], materials: ['aluminum'] }), buildParametricPlan: (intent) => ({ summary: `Build ${intent.object}`, decision: 'Use editable features.', features: [{ name: 'primary-solid', operation: 'parametric-solid', parameters: {} }] }) },
    '../lib/cad/gemini-generate.mjs': { generateCadCode: async () => { state.generations++; return { code: 'function main() {}' }; } },
    '../lib/cad/build-runtime.mjs': {
      describeError: (error) => error.message,
      buildFromCode: async () => {
        state.builds++;
        if (stopAt === 'build') state.status = 'CANCELLED';
        // `shape` is what the drawing engines project from; a truthy stand-in keeps the drawing fan-out in play.
        return { metrics: { volume: 1, surfaceArea: 6, partCount: 1, triangleCount: 12 }, validation: { valid: !invalidGeometry || state.builds > 1, score: 100, findings: [] }, parts: [{ name: 'part' }], shapes: [{ wrapped: {} }], preview: { parts: [] }, step: 'STEP', stl: 'STL' };
      },
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (id) => { assert.ok(id in modules, id); return modules[id]; }, process: { env: provider ? { GEMINI_API_KEY: 'test-fixture' } : {} }, Buffer, TextEncoder, Uint8Array, console });
  await exports.processJob({ id: 'job', projectId: 'project', prompt: 'gear', parentId });
  return state;
}

test('actual worker writes every artifact before marking the revision ready', async () => {
  const state = await runPipeline();
  assert.equal(state.status, 'SUCCEEDED');
  assert.equal(state.valid, true);
  assert.equal(state.artifacts.length, 15);
  assert.equal(state.messages, 1);
});

test('cancel during geometry discards the result before revision creation', async () => {
  const state = await runPipeline('build');
  assert.equal(state.status, 'CANCELLED');
  assert.equal(state.valid, null);
  assert.equal(state.writes, 0);
});

test('cancel during artifact writes leaves a non-ready revision and no success message', async () => {
  const state = await runPipeline('write');
  assert.equal(state.status, 'CANCELLED');
  assert.equal(state.valid, false);
  assert.equal(state.writes, 1);
  assert.equal(state.messages, 0);
});

test('artifact failure leaves the revision non-ready', async () => {
  const state = await runPipeline('write-error');
  assert.equal(state.status, 'FAILED');
  assert.equal(state.valid, false);
  assert.equal(state.messages, 0);
});

test('an edit without a provider fails instead of replacing its base with a template', async () => {
  const state = await runPipeline(undefined, { parentId: 'existing-revision' });
  assert.equal(state.status, 'FAILED');
  assert.equal(state.valid, null);
  assert.equal(state.writes, 0);
  assert.equal(state.artifacts.length, 0);
  assert.equal(state.messages, 0);
  assert.match(state.error, /selected revision is unchanged/);
});

test('worker rechecks parent readiness and project scope before generating an edit', async () => {
  const state = await runPipeline(undefined, { parentId: 'unavailable-revision', parentAvailable: false });
  assert.equal(state.status, 'FAILED');
  assert.equal(state.valid, null);
  assert.equal(state.writes, 0);
  assert.equal(state.messages, 0);
  assert.match(state.error, /editing base is unavailable or no longer ready/);
});

test('invalid geometry without a provider creates no ready revision or artifacts', async () => {
  const state = await runPipeline(undefined, { invalidGeometry: true });
  assert.equal(state.status, 'FAILED');
  assert.equal(state.valid, null);
  assert.equal(state.writes, 0);
});

test('provider repair handles failed validation as well as kernel exceptions', async () => {
  const state = await runPipeline(undefined, { invalidGeometry: true, provider: true });
  assert.equal(state.status, 'SUCCEEDED');
  assert.equal(state.builds, 2);
  assert.equal(state.generations, 2);
  assert.equal(state.valid, true);
});
