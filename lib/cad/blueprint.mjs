// Real projection-based engineering drawings. Every line on the sheet comes from OpenCascade's
// hidden-line-removal pass (replicad `drawProjection` / `makeProjectedEdges`), so the views are
// true orthographic projections of the B-rep, not a bounding-box sketch: curves are curves, edges
// behind material are dashed, and every dimension is measured from that view's own 2D extents.
//
// The pipeline is: project -> 2D polylines -> `composeSheet` (layout, scale, dimensions, title
// block) -> dumb renderers (`sheetSvg`, `sheetDxf`, `sheetPdf`). Nothing here may throw for a
// caller: a view that cannot be projected is dropped and reported in `notes`, and the sheet is
// still produced, because a drawing is a secondary artifact that must never fail a build.
import { describeError } from './build-runtime.mjs';

const SHEET = { width: 420, height: 297, frame: 8 };
const TITLE_BLOCK = { width: 122, height: 48 };
// Preferred drawing scales, largest first; the first one whose views fit the sheet wins.
const SCALES = [50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
// Points per curve when flattening kernel geometry to polylines. Lines are exact; the rest are
// tessellated, which is the one approximation in these drawings (see `curveSamples`).
const CURVE_SAMPLES = { LINE: 2, CIRCLE: 72, ELLIPSE: 72, HYPERBOLA: 40, PARABOLA: 40, BEZIER_CURVE: 40, BSPLINE_CURVE: 64 };
const curveSamples = (geomType) => Math.max(2, CURVE_SAMPLES[geomType] ?? 40);

export const LAYER_STYLES = {
  VISIBLE: { stroke: '#172238', width: 0.4, dash: null },
  HIDDEN: { stroke: '#7a8699', width: 0.22, dash: [2, 1] },
  DIMENSIONS: { stroke: '#4f46e5', width: 0.18, dash: null },
  CONSTRUCTION: { stroke: '#b4457d', width: 0.18, dash: [4, 1.2, 0.6, 1.2] },
  PROFILE: { stroke: '#172238', width: 0.45, dash: null },
  TITLE: { stroke: '#172238', width: 0.3, dash: null },
};

const isFinitePair = (point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
const samePoint = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const round = (value) => Math.round(value * 1000) / 1000;

/** Collects the `Curve2D[]` groups out of a Drawing's inner Blueprint / Blueprints / CompoundBlueprint. */
function curveGroups(inner, out = []) {
  if (!inner || typeof inner !== 'object') return out;
  if (Array.isArray(inner.curves)) { if (inner.curves.length) out.push(inner.curves); return out; }
  if (Array.isArray(inner.blueprints)) { for (const child of inner.blueprints) curveGroups(child, out); return out; }
  return out;
}

function sampleCurve2d(curve) {
  try {
    const first = curve.firstParameter;
    const last = curve.lastParameter;
    if (!Number.isFinite(first) || !Number.isFinite(last) || first === last) return [];
    const count = curveSamples(curve.geomType);
    const points = [];
    for (let i = 0; i < count; i += 1) {
      const point = curve.value(first + (last - first) * (i / (count - 1)));
      if (isFinitePair(point)) points.push([point[0], point[1]]);
    }
    return points;
  } catch {
    return []; // a curve the kernel cannot evaluate simply does not appear on the sheet
  }
}

/**
 * Raw 2D geometry of a projected `Drawing`, preferred over re-parsing `toSVGPaths()` because the
 * kernel curves are still exact here (a projected circle is a CIRCLE, not a pre-flattened polyline).
 * Consecutive curves that share an endpoint are welded into one polyline.
 */
export function polylinesFromDrawing(drawing) {
  const polylines = [];
  for (const curves of curveGroups(drawing?.innerShape)) {
    let current = [];
    for (const curve of curves) {
      const points = sampleCurve2d(curve);
      if (points.length < 2) continue;
      if (current.length && samePoint(current[current.length - 1], points[0])) current.push(...points.slice(1));
      else { if (current.length > 1) polylines.push(current); current = points; }
    }
    if (current.length > 1) polylines.push(current);
  }
  return polylines;
}

/** Same, from the raw HLR edges. They are already projected onto the camera plane, so z is dropped. */
export function polylinesFromEdges(edges) {
  const polylines = [];
  for (const edge of edges ?? []) {
    try {
      const count = curveSamples(edge.geomType);
      const points = [];
      for (let i = 0; i < count; i += 1) {
        const [x, y] = edge.pointAt(i / (count - 1)).toTuple();
        if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]);
      }
      if (points.length > 1) polylines.push(points);
    } catch {
      // an unreadable edge simply does not appear on the sheet
    }
  }
  return polylines;
}

export function boundsOf(groups) {
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (const polylines of groups) for (const line of polylines ?? []) for (const point of line) {
    for (let k = 0; k < 2; k += 1) { if (point[k] < min[k]) min[k] = point[k]; if (point[k] > max[k]) max[k] = point[k]; }
  }
  return Number.isFinite(min[0]) && Number.isFinite(min[1]) ? { min, max } : null;
}

function unionBounds(a, b) {
  if (!a) return b;
  if (!b) return a;
  return { min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1])], max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1])] };
}

function boundsFromBox2d(box) {
  try {
    const [min, max] = box.bounds;
    return isFinitePair(min) && isFinitePair(max) ? { min: [min[0], min[1]], max: [max[0], max[1]] } : null;
  } catch {
    return null;
  }
}

/**
 * One orthographic view with hidden-line removal. `camera` is a `ProjectionPlane` name or a
 * `ProjectionCamera`. Throws if the view yields no geometry so the caller can drop just that view.
 */
export function projectView(replicad, shape, camera, { id, label }) {
  let visible = [];
  let hidden = [];
  let bounds = null;
  try {
    const projection = replicad.drawProjection(shape, camera);
    visible = polylinesFromDrawing(projection.visible);
    hidden = polylinesFromDrawing(projection.hidden);
    bounds = unionBounds(boundsFromBox2d(projection.visible.boundingBox), boundsOf([hidden]));
  } catch {
    // `drawProjection` stitches curves into Blueprints and throws when one of the two sets is
    // empty (a projection with no hidden edges at all). The raw HLR pass has no such restriction.
    const projectionCamera = typeof camera === 'string' ? replicad.lookFromPlane(camera) : camera;
    const edges = replicad.makeProjectedEdges(shape, projectionCamera, true);
    visible = polylinesFromEdges(edges.visible);
    hidden = polylinesFromEdges(edges.hidden);
    bounds = boundsOf([visible, hidden]);
  }
  if (!bounds || visible.length + hidden.length === 0) throw new Error(`the ${label} view projected to no geometry`);
  return { id, label, kind: 'projection', visible, hidden, bounds, width: bounds.max[0] - bounds.min[0], height: bounds.max[1] - bounds.min[1] };
}

/**
 * A single projectable shape for a possibly multi-part model. Projection only reads `shape.wrapped`,
 * so single parts are used directly and never consumed; a compound of clones is built for
 * assemblies and released by the returned `dispose()` (the caller's own shapes are left untouched).
 */
export function toProjectableShape(replicad, shapes) {
  const list = (Array.isArray(shapes) ? shapes : [shapes]).filter((shape) => shape && typeof shape === 'object' && shape.wrapped);
  if (list.length === 0) return { shape: null, dispose() {} };
  if (list.length === 1) return { shape: list[0], dispose() {} };
  const compound = replicad.makeCompound(list.map((shape) => shape.clone()));
  return { shape: compound, dispose() { try { compound.delete(); } catch { /* already released */ } } };
}

/** Third-angle projection cameras, plus an isometric camera aimed at the shape. */
function viewCameras(replicad, shape) {
  const cameras = [
    { id: 'front', label: 'FRONT', camera: 'front' },
    { id: 'top', label: 'TOP', camera: 'top' },
    { id: 'right', label: 'RIGHT', camera: 'right' },
  ];
  try {
    const camera = new replicad.ProjectionCamera([1, 1, 1]);
    camera.lookAt(shape);
    cameras.push({ id: 'iso', label: 'ISO', camera, dimensioned: false });
  } catch (error) {
    cameras.push({ id: 'iso', label: 'ISO', camera: null, dimensioned: false, error: describeError(error) });
  }
  return cameras;
}

/** Projects the four standard views. Never throws: failures land in `notes`. */
export function projectViews(replicad, shape) {
  const views = [];
  const notes = [];
  for (const { id, label, camera, dimensioned, error } of viewCameras(replicad, shape)) {
    if (!camera) { notes.push(`${label} view omitted: ${error}.`); continue; }
    try {
      views.push({ ...projectView(replicad, shape, camera, { id, label }), dimensioned: dimensioned !== false });
    } catch (failure) {
      notes.push(`${label} view omitted: ${describeError(failure)}.`);
    }
  }
  return { views, notes };
}

// ---------------------------------------------------------------------------------------------
// Sheet composition. Produces renderer-agnostic primitives in a y-up coordinate system whose
// origin is the bottom-left of the sheet (or of the content, in `model` mode).
// ---------------------------------------------------------------------------------------------

const scaleLabel = (scale) => (scale >= 1 ? `${round(scale)}:1` : `1:${round(1 / scale)}`);

function chooseScale(block, area) {
  for (const scale of SCALES) if (block.w * scale <= area.w && block.h * scale <= area.h) return { scale, label: scaleLabel(scale) };
  const fit = Math.min(area.w / Math.max(block.w, 1e-9), area.h / Math.max(block.h, 1e-9));
  return { scale: fit, label: `1:${Math.max(1, Math.round(1 / fit))} (fitted)` };
}

/**
 * Third-angle arrangement: FRONT bottom-left, TOP directly above it (shared X), RIGHT directly
 * beside it (shared Z), ISO in the remaining upper-right cell. Returns y-up placements.
 */
const THIRD_ANGLE_IDS = new Set(['front', 'top', 'right', 'iso']);

/** Two-column flow layout for view sets that are not the standard third-angle arrangement. */
function layoutGrid(views, scale, gap, origin) {
  const columns = views.length > 1 ? 2 : 1;
  const rows = Math.ceil(views.length / columns);
  const colWidth = [];
  const rowHeight = [];
  views.forEach((view, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    colWidth[column] = Math.max(colWidth[column] ?? 0, view.width * scale);
    rowHeight[row] = Math.max(rowHeight[row] ?? 0, view.height * scale);
  });
  const xOf = (column) => origin.x + colWidth.slice(0, column).reduce((sum, width) => sum + width + gap, 0);
  const yOf = (row) => origin.y + rowHeight.slice(0, row).reduce((sum, height) => sum + height + gap, 0);
  return {
    block: {
      w: colWidth.reduce((sum, width, index) => sum + width + (index ? gap : 0), 0),
      h: rowHeight.reduce((sum, height, index) => sum + height + (index ? gap : 0), 0),
    },
    placements: views.map((view, index) => ({
      view,
      x: xOf(index % columns),
      y: yOf(Math.floor(index / columns)),
      w: view.width * scale,
      h: view.height * scale,
    })),
  };
}

function layoutViews(views, scale, gap, origin) {
  // Only the standard orthographic set gets the third-angle cell arrangement; anything else
  // (section profiles, for instance) flows into a plain grid.
  if (!views.every((view) => THIRD_ANGLE_IDS.has(view.id))) return layoutGrid(views, scale, gap, origin);
  const by = Object.fromEntries(views.map((view) => [view.id, view]));
  const w = (id) => (by[id] ? by[id].width * scale : 0);
  const h = (id) => (by[id] ? by[id].height * scale : 0);
  const columnOne = Math.max(w('front'), w('top'));
  const columnTwo = Math.max(w('right'), w('iso'));
  const rowOne = Math.max(h('front'), h('right'));
  const rowTwo = Math.max(h('top'), h('iso'));
  const columnTwoX = origin.x + columnOne + (columnTwo ? gap : 0);
  const rowTwoY = origin.y + rowOne + (rowTwo ? gap : 0);
  const cells = { front: [origin.x, origin.y], top: [origin.x, rowTwoY], right: [columnTwoX, origin.y], iso: [columnTwoX, rowTwoY] };
  return {
    block: { w: columnOne + (columnTwo ? gap + columnTwo : 0), h: rowOne + (rowTwo ? gap + rowTwo : 0) },
    placements: views.map((view) => ({ view, x: cells[view.id][0], y: cells[view.id][1], w: view.width * scale, h: view.height * scale })),
  };
}

function blockExtent(views, scale, gap) {
  return layoutViews(views, scale, gap, { x: 0, y: 0 }).block;
}

const poly = (layer, pts) => ({ t: 'poly', layer, pts });
const text = (layer, x, y, size, value, options = {}) => ({ t: 'text', layer, x, y, size, value, anchor: options.anchor ?? 'start', angle: options.angle ?? 0 });

/** Arrowhead as an explicit polyline so every renderer draws it identically (no SVG markers). */
function arrowHead(x, y, dx, dy, size) {
  const length = Math.hypot(dx, dy) || 1;
  const ux = (dx / length) * size;
  const uy = (dy / length) * size;
  const px = -uy * 0.32;
  const py = ux * 0.32;
  return poly('DIMENSIONS', [[x + ux + px, y + uy + py], [x, y], [x + ux - px, y + uy - py]]);
}

/** Extension lines + arrowed dimension line + measured value, in sheet units. */
function dimension(items, { x1, y1, x2, y2, offset, value, unit, vertical }) {
  const arrow = unit * 2.2;
  if (vertical) {
    const lineX = x2 + offset;
    items.push(poly('DIMENSIONS', [[x2, y1], [lineX + unit * 1.2, y1]]), poly('DIMENSIONS', [[x2, y2], [lineX + unit * 1.2, y2]]));
    items.push(poly('DIMENSIONS', [[lineX, y1], [lineX, y2]]), arrowHead(lineX, y1, 0, 1, arrow), arrowHead(lineX, y2, 0, -1, arrow));
    items.push(text('DIMENSIONS', lineX + unit * 1.1, (y1 + y2) / 2, unit * 2.4, value, { anchor: 'middle', angle: 90 }));
  } else {
    const lineY = y1 - offset;
    items.push(poly('DIMENSIONS', [[x1, y1], [x1, lineY - unit * 1.2]]), poly('DIMENSIONS', [[x2, y1], [x2, lineY - unit * 1.2]]));
    items.push(poly('DIMENSIONS', [[x1, lineY], [x2, lineY]]), arrowHead(x1, lineY, 1, 0, arrow), arrowHead(x2, lineY, -1, 0, arrow));
    items.push(text('DIMENSIONS', (x1 + x2) / 2, lineY + unit * 0.9, unit * 2.4, value, { anchor: 'middle' }));
  }
}

function titleBlockItems(meta, scaleText, notes, box) {
  const items = [];
  const { x, y, w, h } = box;
  items.push(poly('TITLE', [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]));
  const rows = 5;
  const rowHeight = h / rows;
  for (let i = 1; i < rows; i += 1) items.push(poly('TITLE', [[x, y + rowHeight * i], [x + w, y + rowHeight * i]]));
  items.push(poly('TITLE', [[x + w * 0.52, y], [x + w * 0.52, y + rowHeight * (rows - 1)]]));
  const line = (row, column, label, value, size = 2.6) => {
    const cx = x + 2.4 + (column ? w * 0.52 : 0);
    const cy = y + rowHeight * row + rowHeight * 0.32;
    items.push(text('TITLE', cx, cy + rowHeight * 0.34, 1.9, label));
    items.push(text('TITLE', cx, cy - rowHeight * 0.06, size, value));
  };
  items.push(text('TITLE', x + 2.4, y + rowHeight * 4 + rowHeight * 0.34, 4.4, meta.name));
  line(3, 0, 'REVISION', `REV ${meta.revisionNumber}`);
  line(3, 1, 'SCALE', scaleText);
  line(2, 0, 'UNITS', 'mm (ISO, third angle)');
  line(2, 1, 'DATE', meta.date);
  line(1, 0, 'VOLUME', `${meta.volume} mm3`);
  line(1, 1, 'SURFACE AREA', `${meta.surfaceArea} mm2`);
  items.push(text('TITLE', x + 2.4, y + rowHeight * 0.55, 1.9, meta.provenance));
  if (notes.length) items.push(text('TITLE', x + 2.4, y + rowHeight * 0.2, 1.9, `NOTE: ${notes.join(' ')}`.slice(0, 96)));
  return items;
}

/**
 * Lays out the projected views and returns drawing primitives.
 *  - `mode: 'sheet'` fits everything on a framed A3 sheet at a preferred scale (for SVG and PDF).
 *  - `mode: 'model'` places the same views at 1:1 true size with no frame (for DXF/CAD reuse).
 */
export function composeSheet(views, meta, { mode = 'sheet', notes = [], title = 'MULTI-VIEW PROJECTION' } = {}) {
  const drawable = views.filter((view) => view.width > 0 || view.height > 0 || view.visible.length);
  const extent = Math.max(1, ...drawable.flatMap((view) => [view.width, view.height]));
  const unit = mode === 'sheet' ? 1 : Math.max(1, extent / 120);
  const gap = mode === 'sheet' ? 20 : extent * 0.12;
  const dimRoom = unit * 20;

  let scale = 1;
  let scaleText = '1:1';
  let sheet;
  let origin;
  if (mode === 'sheet') {
    const area = { w: SHEET.width - SHEET.frame * 2 - dimRoom - 6, h: SHEET.height - SHEET.frame * 2 - TITLE_BLOCK.height - dimRoom - 8 };
    const chosen = chooseScale(blockExtent(drawable, 1, 0), { w: Math.max(area.w - gap, 10), h: Math.max(area.h - gap, 10) });
    scale = chosen.scale;
    scaleText = chosen.label;
    sheet = { width: SHEET.width, height: SHEET.height };
    const block = blockExtent(drawable, scale, gap);
    origin = { x: SHEET.frame + dimRoom + Math.max(0, (area.w - gap - block.w) / 2), y: SHEET.frame + TITLE_BLOCK.height + dimRoom * 0.6 + Math.max(0, (area.h - gap - block.h) / 2) };
  } else {
    const block = blockExtent(drawable, 1, gap);
    origin = { x: dimRoom, y: dimRoom + TITLE_BLOCK.height * unit * 1.1 };
    sheet = { width: block.w + dimRoom * 2, height: block.h + origin.y + dimRoom };
  }

  const { placements } = layoutViews(drawable, scale, gap, origin);
  const items = [];
  if (mode === 'sheet') {
    items.push(poly('TITLE', [[SHEET.frame, SHEET.frame], [SHEET.width - SHEET.frame, SHEET.frame], [SHEET.width - SHEET.frame, SHEET.height - SHEET.frame], [SHEET.frame, SHEET.height - SHEET.frame], [SHEET.frame, SHEET.frame]]));
    items.push(text('TITLE', SHEET.frame + 3, SHEET.height - SHEET.frame - 6, 4.2, `${title} / REVISION ${meta.revisionNumber}`));
    items.push(text('TITLE', SHEET.frame + 3, SHEET.height - SHEET.frame - 11, 2.4, `${meta.name} - all lines are orthographic projections of the B-rep with hidden-line removal.`));
  }

  for (const placement of placements) {
    const { view, x, y, w, h } = placement;
    const map = ([px, py]) => [x + (px - view.bounds.min[0]) * scale, y + (py - view.bounds.min[1]) * scale];
    for (const line of view.hidden) items.push(poly('HIDDEN', line.map(map)));
    for (const line of view.visible) items.push(poly(view.kind === 'section' ? 'PROFILE' : 'VISIBLE', line.map(map)));
    for (const line of view.construction ?? []) items.push(poly('CONSTRUCTION', line.map(map)));
    items.push(text('TITLE', x + w / 2, y + h + unit * 3.4, unit * 3, view.label, { anchor: 'middle' }));
    if (view.note) items.push(text('TITLE', x + w / 2, y + h + unit * 0.9, unit * 2, view.note, { anchor: 'middle' }));
    if (view.dimensioned === false) continue;
    dimension(items, { x1: x, y1: y, x2: x + w, y2: y, offset: unit * 9, value: `${view.width.toFixed(2)}`, unit, vertical: false });
    dimension(items, { x1: x + w, y1: y, x2: x + w, y2: y + h, offset: unit * 7, value: `${view.height.toFixed(2)}`, unit, vertical: true });
  }

  if (mode === 'sheet') {
    items.push(...titleBlockItems(meta, scaleText, notes, { x: SHEET.width - SHEET.frame - TITLE_BLOCK.width, y: SHEET.frame, w: TITLE_BLOCK.width, h: TITLE_BLOCK.height }));
  } else {
    const lines = [`${meta.name} - ${title} - REVISION ${meta.revisionNumber}`, `UNITS mm - TRUE SIZE 1:1 - SHEET SCALE ${scaleText} - ${meta.date}`, `VOLUME ${meta.volume} mm3 - SURFACE AREA ${meta.surfaceArea} mm2`, meta.provenance, ...notes.map((note) => `NOTE: ${note}`)];
    lines.forEach((value, index) => items.push(text('TITLE', dimRoom, (lines.length - index) * unit * 4, unit * 2.8, value)));
  }
  return { items, sheet, scale, scaleLabel: scaleText, views: drawable, notes };
}

// ---------------------------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------------------------

const xmlEscape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Sheet primitives as a standalone SVG. y is flipped here; everything upstream is y-up. */
export function sheetSvg(composed, documentTitle) {
  const { width, height } = composed.sheet;
  const fy = (y) => round(height - y);
  const styles = Object.entries(LAYER_STYLES).map(([layer, style]) => `.l-${layer}{fill:none;stroke:${style.stroke};stroke-width:${style.width};stroke-linecap:round;stroke-linejoin:round${style.dash ? `;stroke-dasharray:${style.dash.join(' ')}` : ''}}`).join('');
  const body = composed.items.map((item) => {
    if (item.t === 'poly') {
      if (item.pts.length < 2) return '';
      return `<path class="l-${item.layer}" d="M ${item.pts.map(([x, y]) => `${round(x)} ${fy(y)}`).join(' L ')}"/>`;
    }
    const anchor = item.anchor === 'middle' ? ' text-anchor="middle"' : '';
    const transform = item.angle ? ` transform="rotate(${-item.angle} ${round(item.x)} ${fy(item.y)})"` : '';
    return `<text x="${round(item.x)}" y="${fy(item.y)}" font-size="${round(item.size)}" fill="${LAYER_STYLES[item.layer]?.stroke ?? '#172238'}"${anchor}${transform}>${xmlEscape(item.value)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${round(width)} ${round(height)}"><title>${xmlEscape(documentTitle)}</title><style>text{font-family:ui-monospace,SFMono-Regular,monospace}${styles}</style><rect x="0" y="0" width="${round(width)}" height="${round(height)}" fill="#ffffff"/>${body}</svg>`;
}

const DXF_COLORS = { VISIBLE: 7, HIDDEN: 8, DIMENSIONS: 5, CONSTRUCTION: 6, PROFILE: 7, TITLE: 7 };

/**
 * DXF R12 with real projected geometry on VISIBLE / HIDDEN / DIMENSIONS / TITLE layers.
 * Two-point runs become LINE, longer runs POLYLINE/VERTEX/SEQEND. Only straight lines are emitted:
 * the projected arcs and splines are tessellated (see CURVE_SAMPLES), so curves are polygonal
 * approximations rather than DXF ARC/SPLINE entities.
 */
export function sheetDxf(composed) {
  const out = [];
  const push = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), String(pairs[i + 1])); };
  const layers = Object.keys(DXF_COLORS);
  push(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 9, '$EXTMIN', 10, 0, 20, 0, 9, '$EXTMAX', 10, round(composed.sheet.width), 20, round(composed.sheet.height), 0, 'ENDSEC');
  push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 2);
  push(0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0);
  push(0, 'LTYPE', 2, 'DASHED', 70, 0, 3, '__ __ __', 72, 65, 73, 2, 40, 0.75, 49, 0.5, 49, -0.25);
  push(0, 'ENDTAB', 0, 'TABLE', 2, 'LAYER', 70, layers.length);
  for (const layer of layers) push(0, 'LAYER', 2, layer, 70, 0, 62, DXF_COLORS[layer], 6, layer === 'HIDDEN' || layer === 'CONSTRUCTION' ? 'DASHED' : 'CONTINUOUS');
  push(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  for (const item of composed.items) {
    if (item.t === 'text') { push(0, 'TEXT', 8, item.layer, 10, round(item.x), 20, round(item.y), 30, 0, 40, round(item.size), 50, round(item.angle), 1, String(item.value)); continue; }
    if (item.pts.length < 2) continue;
    if (item.pts.length === 2) {
      const [[x1, y1], [x2, y2]] = item.pts;
      push(0, 'LINE', 8, item.layer, 10, round(x1), 20, round(y1), 30, 0, 11, round(x2), 21, round(y2), 31, 0);
      continue;
    }
    const closed = samePoint(item.pts[0], item.pts[item.pts.length - 1]);
    const vertices = closed ? item.pts.slice(0, -1) : item.pts;
    push(0, 'POLYLINE', 8, item.layer, 66, 1, 70, closed ? 1 : 0, 10, 0, 20, 0, 30, 0);
    for (const [x, y] of vertices) push(0, 'VERTEX', 8, item.layer, 10, round(x), 20, round(y), 30, 0);
    push(0, 'SEQEND', 8, item.layer);
  }
  push(0, 'ENDSEC', 0, 'EOF');
  return `${out.join('\n')}\n`;
}

const PT_PER_MM = 72 / 25.4;
const pdfEscape = (value) => String(value).replace(/([\\()])/g, '\\$1').replace(/[^\x20-\x7e]/g, '-');

/** Hand-rolled single-page PDF. Sheet primitives map straight onto PDF path operators (both y-up). */
export function sheetPdf(composed, documentTitle) {
  const width = composed.sheet.width * PT_PER_MM;
  const height = composed.sheet.height * PT_PER_MM;
  const parts = ['1 1 1 rg', `0 0 ${round(width)} ${round(height)} re f`, '1 J 1 j'];
  const hex = (value) => {
    const n = parseInt(value.slice(1), 16);
    return `${round(((n >> 16) & 255) / 255)} ${round(((n >> 8) & 255) / 255)} ${round((n & 255) / 255)}`;
  };
  let layer = null;
  for (const item of composed.items) {
    const style = LAYER_STYLES[item.layer] ?? LAYER_STYLES.VISIBLE;
    if (item.layer !== layer) {
      layer = item.layer;
      parts.push(`${hex(style.stroke)} RG`, `${hex(style.stroke)} rg`, `${round(style.width * PT_PER_MM)} w`, style.dash ? `[${style.dash.map((d) => round(d * PT_PER_MM)).join(' ')}] 0 d` : '[] 0 d');
    }
    if (item.t === 'poly') {
      if (item.pts.length < 2) continue;
      parts.push(item.pts.map(([x, y], index) => `${round(x * PT_PER_MM)} ${round(y * PT_PER_MM)} ${index ? 'l' : 'm'}`).join(' '), 'S');
      continue;
    }
    const size = item.size * PT_PER_MM;
    const value = pdfEscape(item.value);
    // PDF has no text anchoring; approximate centring with the Courier advance width (0.6 em).
    const x = item.x * PT_PER_MM - (item.anchor === 'middle' ? (value.length * size * 0.6) / 2 : 0);
    const matrix = item.angle ? `${round(Math.cos((item.angle * Math.PI) / 180))} ${round(Math.sin((item.angle * Math.PI) / 180))} ${round(-Math.sin((item.angle * Math.PI) / 180))} ${round(Math.cos((item.angle * Math.PI) / 180))} ${round(item.x * PT_PER_MM)} ${round(item.y * PT_PER_MM)} Tm` : `1 0 0 1 ${round(x)} ${round(item.y * PT_PER_MM)} Tm`;
    parts.push(`BT /F1 ${round(size)} Tf ${matrix} (${value}) Tj ET`);
  }
  const stream = parts.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${round(width)} ${round(height)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Title (${pdfEscape(documentTitle)}) /Creator (CadPilot projected drawing) >>`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 0; i < objects.length; i += 1) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

// ---------------------------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------------------------

function drawingMeta(meta) {
  return {
    name: String(meta?.name ?? 'Generated part').slice(0, 64),
    revisionNumber: meta?.revisionNumber ?? 1,
    date: meta?.date ?? new Date().toISOString().slice(0, 10),
    volume: Math.round(Number(meta?.volume ?? 0)).toLocaleString('en-US'),
    surfaceArea: Math.round(Number(meta?.surfaceArea ?? 0)).toLocaleString('en-US'),
    provenance: meta?.provenance ?? 'GENERATED FROM THE BUILT B-REP BY CADPILOT (OPENCASCADE HIDDEN-LINE REMOVAL). NOT A CHECKED DRAWING.',
  };
}

/**
 * Builds the full drawing set for a revision. Returns `{ svg, dxf, pdf, notes, views, scaleLabel }`,
 * or `null` when nothing at all could be projected (the caller then skips the artifacts). Never throws.
 */
export function buildBlueprint(replicad, shapes, meta) {
  const projectable = toProjectableShape(replicad, shapes);
  if (!projectable.shape) return null;
  try {
    const { views, notes } = projectViews(replicad, projectable.shape);
    if (views.length === 0) return null;
    const info = drawingMeta(meta);
    const documentTitle = `${info.name} - multi-view projection - revision ${info.revisionNumber}`;
    const sheetComposition = composeSheet(views, info, { mode: 'sheet', notes });
    const modelComposition = composeSheet(views, info, { mode: 'model', notes });
    return {
      svg: sheetSvg(sheetComposition, documentTitle),
      dxf: sheetDxf(modelComposition),
      pdf: sheetPdf(sheetComposition, documentTitle),
      notes,
      views: views.map(({ id, label, width, height, visible, hidden }) => ({ id, label, width, height, visibleCount: visible.length, hiddenCount: hidden.length })),
      scaleLabel: sheetComposition.scaleLabel,
    };
  } catch (error) {
    // A drawing is a secondary artifact: report and give up, never fail the revision.
    return { svg: null, dxf: null, pdf: null, notes: [`Drawing generation failed: ${describeError(error)}.`], views: [], scaleLabel: null };
  } finally {
    projectable.dispose();
  }
}
