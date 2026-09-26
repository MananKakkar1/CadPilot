import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { AgentRunStatus, AgentStepStatus, AgentStepType } from '@prisma/client';

const transpile = (code) => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

const source = await readFile(new URL('../app/api/projects/[slug]/builds/route.ts', import.meta.url), 'utf8');
const compiled = transpile(source);
// The queued-build unit lives in a shared helper; compile the REAL one so these tests still
// exercise its transaction ordering rather than a stub of it.
const queueBuildSource = await readFile(new URL('../lib/cad/queue-build.ts', import.meta.url), 'utf8');
const queueBuildCompiled = transpile(queueBuildSource);

function loadQueueBuild() {
  const exports = {};
  const modules = { '@prisma/client': { AgentRunStatus, AgentStepStatus, AgentStepType } };
  vm.runInNewContext(queueBuildCompiled, { exports, require: (id) => { assert.ok(id in modules, id); return modules[id]; } });
  return exports;
}

function fixture({ valid = true, eventFailure = false, workerConnected = true } = {}) {
  const committed = [];
  let notifications = 0;
  const db = {
    revision: { findFirst: async ({ where }) => {
      assert.equal(where.projectId, 'project');
      assert.equal(where.isValid, true);
      return valid ? { id: 'parent' } : null;
    } },
    $transaction: async (fn) => {
      const pending = [];
      const tx = Object.fromEntries(['buildJob', 'agentRun', 'chatMessage', 'buildEvent', 'agentEvent'].map((name) => [name, {
        create: async ({ data }) => {
          if (eventFailure && name === 'agentEvent') throw new Error('Event insert failed');
          pending.push(name);
          return { ...data, id: name };
        },
      }]));
      const result = await fn(tx);
      committed.push(...pending);
      return result;
    },
  };
  const exports = {};
  const modules = {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@prisma/client': { AgentRunStatus, AgentStepStatus, AgentStepType },
    '@/lib/prisma': { prisma: db },
    '@/lib/cad/contracts': { parsePrompt: (prompt) => prompt },
    '@/lib/projects': { requireProjectOwner: async () => ({ project: { id: 'project' } }) },
    '@/lib/cad/queue-build': loadQueueBuild(),
    '@/lib/cad/worker-socket': { notifyCadWorker: async () => {
      assert.ok(committed.includes('buildEvent'));
      assert.ok(committed.includes('agentEvent'));
      notifications++;
      return workerConnected;
    } },
  };
  vm.runInNewContext(compiled, { exports, require: (id) => { assert.ok(id in modules, id); return modules[id]; } });
  return { post: exports.POST, committed, get notifications() { return notifications; } };
}

const request = () => new Request('http://localhost/builds', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Add a hole', parentRevisionId: 'parent' }),
});
const params = { params: Promise.resolve({ slug: 'part' }) };

test('unfinished parents cannot enqueue an edit', async () => {
  const f = fixture({ valid: false });
  const response = await f.post(request(), params);
  assert.equal(response.status, 400);
  assert.equal(f.committed.length, 0);
  assert.equal(f.notifications, 0);
});

test('worker is notified only after job and initial events commit', async () => {
  const f = fixture();
  const response = await f.post(request(), params);
  assert.equal(response.status, 202);
  assert.equal((await response.json()).job.parentId, 'parent');
  assert.equal(f.notifications, 1);
});

test('initial-event failure rolls back the queued job', async () => {
  const f = fixture({ eventFailure: true });
  const response = await f.post(request(), params);
  assert.equal(response.status, 400);
  assert.equal(f.committed.length, 0);
  assert.equal(f.notifications, 0);
});

test('unavailable worker preserves accepted queue submission', async () => {
  const f = fixture({ workerConnected: false });
  const response = await f.post(request(), params);
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.workerConnected, false);
  assert.equal(body.job.id, 'buildJob');
  assert.equal(body.run.buildJobId, body.job.id);
  assert.equal(f.committed.length, 5);
});
