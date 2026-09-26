import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual route with a fake database and deterministic scheduling.
const source = await readFile(new URL('../app/api/runs/[runId]/events/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture({ status = 'EXECUTING', events = [], pending } = {}) {
  const scheduled = new Map();
  const queries = [];
  let sequence = 0;
  const exports = {};
  const prisma = {
    agentRun: { findFirst: async () => ({ id: 'run' }), findUnique: async () => ({ status, error: null }) },
    agentEvent: { findMany: async (query) => { queries.push(query); return pending ? await pending : events; } },
  };
  vm.runInNewContext(compiled, {
    exports, Response, ReadableStream, TextEncoder, URL,
    setTimeout: (fn) => { const id = ++sequence; scheduled.set(id, fn); return id; },
    clearTimeout: (id) => scheduled.delete(id),
    require: (id) => id === '@/lib/prisma' ? { prisma } : { requireUser: async () => ({ id: 'owner' }) },
  });
  return { get: exports.GET, scheduled, queries };
}

const params = { params: Promise.resolve({ runId: 'run' }) };
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('completed runs emit their events and terminal state without scheduling polls', async () => {
  const f = fixture({ status: 'COMPLETED', events: [{ sequence: 4, summary: 'Built' }] });
  const response = await f.get(new Request('http://localhost/events'), params);
  const body = await response.text();
  assert.match(body, /id: 4\nevent: agent/);
  assert.match(body, /event: complete/);
  assert.equal(f.scheduled.size, 0);
});

test('reconnect uses Last-Event-ID and cancelling releases its timer', async () => {
  const f = fixture();
  const response = await f.get(new Request('http://localhost/events?after=2', { headers: { 'Last-Event-ID': '9' } }), params);
  await settle();
  assert.equal(f.queries[0].where.sequence.gt, 9);
  assert.equal(f.scheduled.size, 1);
  await response.body.cancel();
  assert.equal(f.scheduled.size, 0);
});

test('abort during a database request does not enqueue or schedule more work', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const f = fixture({ pending });
  const controller = new AbortController();
  const response = await f.get(new Request('http://localhost/events', { signal: controller.signal }), params);
  controller.abort();
  resolve([{ sequence: 1 }]);
  await settle();
  assert.equal(await response.text(), '');
  assert.equal(f.scheduled.size, 0);
});
