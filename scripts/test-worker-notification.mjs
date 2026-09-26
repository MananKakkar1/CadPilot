import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../lib/cad/worker-socket.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function fixture(throws = false) {
  const socket = new EventEmitter();
  socket.setTimeout = (ms) => assert.equal(ms, 750);
  socket.end = (data) => { socket.payload = JSON.parse(data); };
  socket.destroy = () => { socket.destroyed = true; socket.emit('close'); };
  const exports = {};
  vm.runInNewContext(compiled, { exports, process: { env: {} }, require: () => ({ createConnection: () => {
    if (throws) throw new Error('Invalid port');
    return socket;
  } }) });
  return { socket, notify: exports.notifyCadWorker };
}

test('synchronous transport failure resolves false instead of rejecting a saved build', async () => {
  assert.equal(await fixture(true).notify('job'), false);
});
for (const event of ['error', 'close', 'timeout']) test(`${event} before connection resolves false`, async () => {
  const { socket, notify } = fixture();
  const pending = notify('job');
  socket.emit(event, new Error('Unavailable'));
  assert.equal(await pending, false);
  if (event === 'timeout') assert.equal(socket.destroyed, true);
});
test('connection sends job identity and later close does not change success', async () => {
  const { socket, notify } = fixture();
  const pending = notify('job');
  socket.emit('connect');
  socket.emit('close');
  assert.equal(await pending, true);
  assert.deepEqual(socket.payload, { type: 'run', jobId: 'job' });
});
