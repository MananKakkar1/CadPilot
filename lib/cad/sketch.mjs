// Real 2D sketch profiles for a built model.
//
// A "sketch" here is a genuine cross-section: the solid is intersected with a thin slab at a
// section plane and the resulting sliver is projected onto that plane. When the intersection
// cannot be computed the view falls back to a projected OUTLINE, and it is labelled as such —
// an outline is never presented as a section.
import { boundsOf, composeSheet, polylinesFromDrawing, polylinesFromEdges, projectView, sheetDxf, sheetSvg, toProjectableShape } from './blueprint.mjs';
import { describeError } from './build-runtime.mjs';

// Thin enough to read as a plane, thick enough that the boolean is numerically stable.
const SLAB_RATIO = 0.002;
const MIN_SLAB = 0.01;

const SECTIONS = [
  { id: 'section-xy', label: 'SECTION A-A (XY)', plane: 'top', axis: 2 },
  { id: 'section-xz', label: 'SECTION B-B (XZ)', plane: 'front', axis: 1 },
  { id: 'section-yz', label: 'SECTION C-C (YZ)', plane: 'right', axis: 0 },
];

function shapeBounds(shape) {
  const box = shape.boundingBox;
  const bounds = box?.bounds;
  if (!Array.isArray(bounds) || bounds.length !== 2) return null;
  const [min, max] = bounds;
  if (![...min, ...max].every((value) => Number.isFinite(value))) return null;
  return { min: [...min], max: [...max] };
}

/** A thin slab spanning the model on two axes and centred on `axis`. Caller deletes it. */
function makeSlab(replicad, bounds, axis) {
  const pad = 1 + Math.max(...bounds.max.map((value, index) => Math.abs(value - bounds.min[index]))) * 0.05;
  const span = bounds.max[axis] - bounds.min[axis];
  const half = Math.max(MIN_SLAB, span * SLAB_RATIO) / 2;
  const mid = (bounds.max[axis] + bounds.min[axis]) / 2;
  const low = bounds.min.map((value, index) => (index === axis ? mid - half : value - pad));
  const high = bounds.max.map((value, index) => (index === axis ? mid + half : value + pad));
  return replicad.makeBox(low, high);
}

/** One section view, or an outline fallback. Throws only if neither can be produced. */
function sectionView(replicad, shape, bounds, { id, label, plane, axis }) {
  let slab = null;
  let sliced = null;
  try {
    slab = makeSlab(replicad, bounds, axis);
    sliced = shape.clone().intersect(slab);
    const view = projectView(replicad, sliced, plane, { id, label });
    return { ...view, kind: 'section' };
  } catch (error) {
    // Boolean failure (or an empty slice) still leaves a useful, honestly-labelled outline.
    const outlineLabel = label.replace(/^SECTION [A-C]-[A-C] /, 'OUTLINE ');
    const view = projectView(replicad, shape, plane, { id, label: outlineLabel });
    return { ...view, kind: 'outline', note: `${label} fell back to a projected outline: ${describeError(error)}.` };
  } finally {
    try { sliced?.delete(); } catch { /* already released */ }
    try { slab?.delete(); } catch { /* already released */ }
  }
}

/** Centre lines and an origin marker for a view, in that view's own 2D coordinates. */
function constructionFor(view) {
  const { bounds } = view;
  const padX = (bounds.max[0] - bounds.min[0]) * 0.08 || 1;
  const padY = (bounds.max[1] - bounds.min[1]) * 0.08 || 1;
  const midX = (bounds.max[0] + bounds.min[0]) / 2;
  const midY = (bounds.max[1] + bounds.min[1]) / 2;
  return [
    [[bounds.min[0] - padX, midY], [bounds.max[0] + padX, midY]],
    [[midX, bounds.min[1] - padY], [midX, bounds.max[1] + padY]],
  ];
}

/**
 * Builds the sketch sheet. Returns null when there is nothing projectable.
 * Shape ownership matches blueprint.mjs: the caller's shapes are never consumed.
 */
export function buildSketch(replicad, shapes, meta) {
  const projectable = toProjectableShape(replicad, shapes);
  if (!projectable.shape) return null;
  try {
    const bounds = shapeBounds(projectable.shape);
    if (!bounds) return { svg: null, dxf: null, notes: ['Sketch skipped: the model has no finite bounding box.'], views: [] };

    const views = [];
    const notes = [];
    for (const section of SECTIONS) {
      try {
        const view = sectionView(replicad, projectable.shape, bounds, section);
        if (view.note) notes.push(view.note);
        // Centre lines ride along with the profile as construction geometry.
        views.push({ ...view, construction: constructionFor(view), dimensioned: true });
      } catch (error) {
        notes.push(`${section.label} omitted: ${describeError(error)}.`);
      }
    }
    if (views.length === 0) return { svg: null, dxf: null, notes: notes.length ? notes : ['No section could be projected.'], views: [] };

    if (views.every((view) => view.kind !== 'section')) notes.push('No true cross-section could be computed; every view here is a projected outline.');

    const sectionCountForNote = views.filter((view) => view.kind === 'section').length;
    const info = {
      ...meta,
      name: meta?.name ?? 'Model',
      // The blueprint's default provenance describes hidden-line projection; sections need their own.
      provenance: sectionCountForNote === views.length
        ? 'CROSS-SECTIONS CUT THROUGH THE BUILT B-REP AT EACH MID-PLANE. NOT A CHECKED DRAWING.'
        : 'MID-PLANE CROSS-SECTIONS WHERE COMPUTABLE, OTHERWISE PROJECTED OUTLINES (SEE NOTES). NOT A CHECKED DRAWING.',
    };
    const title = `${info.name} - sketch profiles - revision ${info.revisionNumber ?? '?'}`;
    const sheet = composeSheet(views, info, { mode: 'sheet', notes, title: 'SKETCH PROFILES' });
    const model = composeSheet(views, info, { mode: 'model', notes, title: 'SKETCH PROFILES' });
    return {
      svg: sheetSvg(sheet, title),
      dxf: sheetDxf(model),
      notes,
      views: views.map(({ id, label, kind, width, height }) => ({ id, label, kind, width, height })),
      scaleLabel: sheet.scaleLabel,
    };
  } catch (error) {
    // Secondary artifact: never fail the revision over it.
    return { svg: null, dxf: null, notes: [`Sketch generation failed: ${describeError(error)}.`], views: [] };
  } finally {
    projectable.dispose();
  }
}

export { polylinesFromDrawing, polylinesFromEdges, boundsOf };
