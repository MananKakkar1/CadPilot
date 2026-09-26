import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFromCode } from '../lib/cad/build-runtime.mjs';

const mesh = { vertices: [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10], triangles: [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3], normals: [] };
function kernel() {
  class Shape {}
  class Solid extends Shape {}
  return {
    Shape, Solid,
    solid: { boundingBox: { bounds: [[0, 0, 0], [10, 10, 10]] }, mesh: () => mesh },
    measureVolume: () => 167,
    measureArea: () => 237,
    exportSTEP: () => new Blob(['STEP fixture']),
  };
}

test('raw mesh remains previewable but cannot claim complete CAD exports', async () => {
  const result = await buildFromCode(`function main() { return ${JSON.stringify(mesh)}; }`, kernel());
  assert.equal(result.validation.valid, true);
  assert.equal(result.validation.complete, false);
  assert.equal(result.step, null);
  assert.ok(result.stl.byteLength > 0);
  assert.match(result.validation.warnings.join(' '), /cannot be exported to STEP/);
});

test('mixed solid and raw mesh exports disclose the partial STEP model', async () => {
  const result = await buildFromCode(`function main(r) { return [r.solid, ${JSON.stringify(mesh)}]; }`, kernel());
  assert.equal(result.validation.complete, false);
  assert.ok(result.step.byteLength > 0);
  assert.equal(result.preview.parts.length, 2);
  assert.match(result.validation.warnings.join(' '), /STEP does not represent the complete model/);
});

test('solid-only successful exports retain complete status', async () => {
  const result = await buildFromCode('function main(r) { return r.solid; }', kernel());
  assert.equal(result.validation.complete, true);
  assert.deepEqual(result.validation.warnings, []);
});
