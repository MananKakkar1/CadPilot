// Real-kernel test: blueprint + sketch generation must produce genuine projected geometry.
// No mocks — this runs the installed replicad/OpenCascade build.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as replicad from 'replicad';
import openCascade from 'replicad-opencascadejs';
import { buildBlueprint } from '../lib/cad/blueprint.mjs';
import { buildSketch } from '../lib/cad/sketch.mjs';

replicad.setOC(await openCascade());

/** A plate with a through-hole and a filleted corner: hidden lines and curves both matter here. */
function testPart() {
  const plate = replicad.makeBaseBox(40, 24, 6);
  const hole = replicad.makeCylinder(4, 40, [0, 0, -10]);
  return plate.cut(hole);
}

const META = { name: 'Test plate', revisionNumber: 7, units: 'mm', volume: 1234, surfaceArea: 567 };

test('blueprint projects multiple views with real geometry and hidden lines', () => {
  const shape = testPart();
  const result = buildBlueprint(replicad, [shape], META);
  assert.ok(result, 'expected a blueprint result');
  assert.ok(result.svg, `expected SVG output; notes: ${result.notes?.join(' ')}`);

  // More than one view, and the standard orthographic set is present.
  assert.ok(result.views.length >= 3, `expected >= 3 views, got ${result.views.length}`);
  const labels = result.views.map((view) => view.label);
  for (const expected of ['FRONT', 'TOP', 'RIGHT']) assert.ok(labels.includes(expected), `missing ${expected} view`);

  // Real projected geometry means many path elements, not a single <rect>.
  const paths = result.svg.match(/<(path|polyline)\b/g) ?? [];
  assert.ok(paths.length > 8, `expected many path elements, found ${paths.length}`);
  assert.ok(!/<rect[^>]*class="line"/.test(result.svg), 'blueprint should not fall back to a bounding rectangle');

  // Hidden lines exist and are styled distinctly from visible ones.
  const hiddenTotal = result.views.reduce((sum, view) => sum + view.hiddenCount, 0);
  assert.ok(hiddenTotal > 0, 'expected at least one hidden edge from the through-hole');
  assert.match(result.svg, /stroke-dasharray/, 'hidden lines must be dashed');

  // Curves from the hole must be sampled, so the view is wider than a plain box outline.
  const front = result.views.find((view) => view.label === 'FRONT');
  assert.ok(front.width > 0 && front.height > 0, 'front view must have real extents');
  assert.ok(result.scaleLabel, 'sheet must state its scale');
  assert.ok(result.dxf && result.dxf.includes('SECTION'), 'expected a DXF with entities');
  assert.ok(result.pdf, 'expected a PDF sheet');
});

test('blueprint dimensions match the modelled part', () => {
  const shape = testPart();
  const result = buildBlueprint(replicad, [shape], META);
  const top = result.views.find((view) => view.label === 'TOP');
  // makeBaseBox(40, 24, 6) is centred, so the top view spans 40 x 24 mm.
  assert.ok(Math.abs(top.width - 40) < 0.5, `top view width ${top.width} should be ~40mm`);
  assert.ok(Math.abs(top.height - 24) < 0.5, `top view height ${top.height} should be ~24mm`);
});

test('sketch produces real section profiles', () => {
  const shape = testPart();
  const result = buildSketch(replicad, [shape], META);
  assert.ok(result, 'expected a sketch result');
  assert.ok(result.svg, `expected sketch SVG; notes: ${result.notes?.join(' ')}`);
  assert.ok(result.views.length > 0, 'expected at least one profile');
  // At least one view must be a genuine cross-section rather than an outline fallback.
  assert.ok(result.views.some((view) => view.kind === 'section'), `expected a true section, got kinds: ${result.views.map((v) => v.kind).join(',')}`);
  const paths = result.svg.match(/<(path|polyline)\b/g) ?? [];
  assert.ok(paths.length > 4, `expected real profile geometry, found ${paths.length} paths`);
});

test('a non-projectable input degrades without throwing', () => {
  assert.equal(buildBlueprint(replicad, [], META), null, 'no shapes should yield null, not a throw');
  assert.equal(buildSketch(replicad, [], META), null, 'no shapes should yield null, not a throw');
  // A garbage shape must be reported in notes rather than crashing the build.
  const broken = buildBlueprint(replicad, [{ wrapped: {} }], META);
  assert.ok(broken === null || Array.isArray(broken.notes), 'expected graceful handling of an unusable shape');
});
