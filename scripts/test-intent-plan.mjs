import assert from 'node:assert/strict';
import test from 'node:test';
import { buildParametricPlan, inferDesignIntent } from '../lib/cad/intent.mjs';

test('intent extraction preserves explicit dimensions and converts units', () => {
  const intent = inferDesignIntent('Create a bracket length 40 mm, width 20 mm, height 10 mm with a 5 mm bore for a steel fit.');
  assert.equal(intent.units, 'mm');
  assert.deepEqual(intent.dimensions, { length: 40, width: 20, height: 10, bore: 5 });
  assert.deepEqual(intent.materials, ['steel']);
  assert.ok(intent.constraints.includes('preserve specified openings'));
  assert.ok(intent.constraints.includes('respect fit and clearance language'));
});

test('plan generation exposes dimensions and feature decisions for approval', () => {
  const intent = inferDesignIntent('Make a 50 x 30 x 8 mm enclosure with a cutout.');
  const plan = buildParametricPlan(intent);
  assert.match(plan.summary, /length=50 mm/);
  assert.ok(plan.features.some((feature) => feature.operation === 'cut-specified-holes-and-cutouts'));
  assert.match(plan.decision, /parameterized BREP/);
});
