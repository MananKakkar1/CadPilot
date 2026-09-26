import assert from 'node:assert/strict';
import test from 'node:test';
import openCascade from 'replicad-opencascadejs';
import * as replicad from 'replicad';
import { buildFromCode } from '../lib/cad/build-runtime.mjs';

replicad.setOC(await openCascade());

test('real kernel exports a complete solid model to STEP and STL', async () => {
  const result = await buildFromCode('function main(r) { return r.makeBox([0,0,0], [10,10,10]); }', replicad);
  assert.ok(Math.abs(result.metrics.volume - 1000) < 1e-6);
  assert.equal(result.validation.complete, true);
  assert.deepEqual(result.validation.warnings, []);
  assert.match(new TextDecoder().decode(result.step), /ISO-10303-21/);
  assert.ok(result.stl.byteLength > 84);
  const imported = await replicad.importSTEP(new Blob([result.step]));
  try { assert.equal(Math.round(replicad.measureVolume(imported)), 1000); }
  finally { imported.delete(); }
});

test('real kernel partial STEP is not a complete mixed-model export', async () => {
  const code = `function main(r) {
    return [r.makeBox([0,0,0], [10,10,10]), {
      vertices: [0,0,0, 10,0,0, 0,10,0, 0,0,10],
      triangles: [0,2,1, 0,1,3, 0,3,2, 1,2,3]
    }];
  }`;
  const result = await buildFromCode(code, replicad);
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.complete, false);
  assert.equal(result.preview.parts.length, 2);
  assert.match(new TextDecoder().decode(result.step), /ISO-10303-21/);
  assert.match(result.validation.warnings.join(' '), /STEP does not represent the complete model/);
  const imported = await replicad.importSTEP(new Blob([result.step]));
  try {
    assert.equal(Math.round(replicad.measureVolume(imported)), 1000);
    assert.ok(Math.abs(result.metrics.volume - (1000 + 1000 / 6)) < 1e-6, 'preview metrics include the tetrahedral mesh omitted by STEP');
  } finally { imported.delete(); }
});

test('sub-millimetre solid retains measurable volume and complete exports', async () => {
  const result = await buildFromCode('function main(r) { return r.makeBox([0,0,0], [0.1,0.1,0.1]); }', replicad);
  assert.ok(Math.abs(result.metrics.volume - 0.001) < 1e-9);
  assert.ok(Math.abs(result.metrics.surfaceArea - 0.06) < 1e-9);
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.complete, true);
  const imported = await replicad.importSTEP(new Blob([result.step]));
  try { assert.ok(Math.abs(replicad.measureVolume(imported) - 0.001) < 1e-9); }
  finally { imported.delete(); }
});
