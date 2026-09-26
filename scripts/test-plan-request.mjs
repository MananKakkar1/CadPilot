import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { AgentRunStatus, AgentStepStatus, AgentStepType } from '@prisma/client';

const source = await readFile(new URL('../app/api/projects/[slug]/runs/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture({ failEvent = false } = {}) {
  const state = { run: null, event: null, buildRequest: null };
  const db = {
    $transaction: async (callback) => {
      const before = { ...state };
      try { return await callback(db); }
      catch (error) { Object.assign(state, before); throw error; }
    },
    revision: { findFirst: async () => ({ id: 'parent' }) },
    agentRun: { create: async ({ data }) => { state.run = data; return { id: 'run', ...data, steps: [{ id: 'step', ...data.steps.create }], approvals: [{ id: 'approval', ...data.approvals.create }] }; } },
    agentEvent: { create: async ({ data }) => { if (failEvent) throw new Error('Event write failed'); state.event = data; } },
  };
  const modules = {
    '../builds/route': { POST: async (request, context) => {
      state.buildRequest = { body: await request.json(), params: await context.params };
      return Response.json({ job: { id: 'job' }, run: { id: 'execution', buildJobId: 'job' }, workerConnected: true }, { status: 202 });
    } },
    '@prisma/client': { AgentRunStatus, AgentStepStatus, AgentStepType },
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/prisma': { prisma: db },
    '@/lib/cad/contracts': { parsePrompt: (prompt) => prompt.trim() },
    '@/lib/projects': { requireProjectOwner: async () => ({ project: { id: 'project' } }) },
    '../../../../../lib/cad/intent.mjs': {
      inferDesignIntent: (prompt) => ({ object: prompt.split(/[,.]/)[0], units: 'mm', dimensions: { length: 40, bore: 5 }, constraints: ['valid closed BREP', 'editable dimensions', 'preserve specified openings'], materials: ['steel'] }),
      buildParametricPlan: (intent) => ({ summary: `Build a parametric ${intent.object} using length=40 mm, bore=5 mm.`, decision: 'Use parameterized BREP primitives.', features: [{ name: 'primary-solid', operation: 'parametric-solid', parameters: intent.dimensions }] }),
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (id) => { assert.ok(id in modules, id); return modules[id]; } });
  return { post: exports.POST, state };
}

test('plan request stores concrete intent and exposes it in approval', async () => {
  const fixtureState = fixture();
  const response = await fixtureState.post(new Request('http://localhost/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'Build a steel bracket with a bore', parentRevisionId: 'parent', mode: 'plan' }) }), { params: Promise.resolve({ slug: 'part' }) });
  assert.equal(response.status, 202);
  assert.equal(fixtureState.state.run.status, AgentRunStatus.AWAITING_APPROVAL);
  assert.equal(fixtureState.state.run.metadata.intent.dimensions.bore, 5);
  assert.match(fixtureState.state.run.approvals.create.explanation, /length=40 mm, bore=5 mm/);
  assert.equal(fixtureState.state.event.type, 'run.created');
});

test('failed initial event rolls back the plan and approval', async () => {
  const f = fixture({ failEvent: true });
  const response = await f.post(new Request('http://localhost/runs', { method: 'POST', body: JSON.stringify({ prompt: 'Bracket', mode: 'plan' }) }), { params: Promise.resolve({ slug: 'part' }) });
  assert.equal(response.status, 400);
  assert.equal(f.state.run, null);
  assert.equal(f.state.event, null);
});

for (const mode of ['execute', undefined]) {
  test(`execution mode ${mode ?? '(default)'} delegates to the build queue with intact input`, async () => {
    const f = fixture();
    const body = { prompt: 'Bracket', parentRevisionId: 'parent', ...(mode ? { mode } : {}) };
    const response = await f.post(new Request('http://localhost/runs', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ slug: 'part' }) });
    assert.equal(response.status, 202);
    assert.deepEqual(f.state.buildRequest, { body, params: { slug: 'part' } });
    assert.equal((await response.json()).run.buildJobId, 'job');
    assert.equal(f.state.run, null, 'must not create an orphaned run');
    assert.equal(f.state.event, null);
  });
}
