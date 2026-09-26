import assert from 'node:assert/strict';
import test from 'node:test';
import { assertJobRunning, withRunningJob, JobStoppedError } from '../lib/cad/job-lifecycle.mjs';

// Models the conditional job-row update and transaction rollback. Production
// integration still needs PostgreSQL concurrency testing; these verify the guard.
function database(status = 'RUNNING') {
  const state = { status, valid: false, run: 'EXECUTING' };
  let tail = Promise.resolve();
  const db = {
    state,
    buildJob: { findUnique: async () => ({ status: state.status }) },
    $transaction: async (callback) => {
      const previous = tail;
      let release;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      const draft = { ...state };
      const tx = {
        state: draft,
        buildJob: { updateMany: async ({ where, data }) => {
          assert.equal(where.id, 'job');
          if (draft.status !== where.status) return { count: 0 };
          draft.status = data.status;
          return { count: 1 };
        } },
      };
      try {
        const result = await callback(tx);
        Object.assign(state, draft);
        return result;
      } finally { release(); }
    },
  };
  return db;
}

test('cancelled and completed jobs reject all worker transitions', async () => {
  for (const status of ['CANCELLED', 'SUCCEEDED', 'FAILED']) {
    const db = database(status);
    await assert.rejects(assertJobRunning(db, 'job'), JobStoppedError);
    await assert.rejects(withRunningJob(db, 'job', () => assert.fail('must not write')), JobStoppedError);
    assert.equal(db.state.status, status);
  }
});

test('failed finalization rolls back revision readiness and terminal status', async () => {
  const db = database();
  await assert.rejects(withRunningJob(db, 'job', async (tx) => {
    tx.state.valid = true;
    tx.state.status = 'SUCCEEDED';
    throw new Error('artifact metadata missing');
  }), /artifact metadata/);
  assert.equal(db.state.valid, false);
  assert.equal(db.state.status, 'RUNNING');
});

test('cancellation winning the job lock prevents finalization', async () => {
  const db = database();
  const cancel = db.$transaction(async (tx) => { tx.state.status = 'CANCELLED'; });
  const finalize = withRunningJob(db, 'job', () => assert.fail('cancelled output cannot finalize'));
  await cancel;
  await assert.rejects(finalize, JobStoppedError);
  assert.equal(db.state.valid, false);
});

test('finalization winning the job lock rejects late cancellation', async () => {
  const db = database();
  const finalize = withRunningJob(db, 'job', async (tx) => {
    tx.state.valid = true; tx.state.status = 'SUCCEEDED'; tx.state.run = 'COMPLETED';
  });
  const cancel = db.$transaction(async (tx) => tx.buildJob.updateMany({
    where: { id: 'job', status: 'RUNNING' }, data: { status: 'CANCELLED' },
  }));
  await finalize;
  assert.equal((await cancel).count, 0);
  assert.deepEqual(db.state, { status: 'SUCCEEDED', valid: true, run: 'COMPLETED' });
});
