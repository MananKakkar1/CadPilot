// Generates lib/cad/replicad-api-reference.mjs from the installed replicad type definitions,
// so the API reference given to Gemini always matches the real library. Run: npm run gen:replicad-api
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dtsPath = resolve(root, 'node_modules/replicad/dist/replicad.d.ts');
const outPath = resolve(root, 'lib/cad/replicad-api-reference.mjs');

// Names that are irrelevant to modelling (I/O, fonts, GC plumbing, manifold, internals).
const EXCLUDE = new Set([
  'AssemblyExporter', 'createAssembly', 'exportSTEP', 'importSTEP', 'importSTL', 'importSTLAsMesh', 'deserializeDrawing',
  'deserializeShape', 'getFont', 'loadFont', 'drawText', 'sketchText', 'textBlueprints', 'GCWithObject', 'GCWithScope',
  'localGC', 'HASH_CODE_MAX', 'getOC', 'setOC', 'getManifold', 'setManifold', 'MeshShape', 'WrappingObj', 'Deletable',
  'cast', 'downcast', 'iterTopo', 'shapeType', 'isShape3D', 'isWire', 'isPoint', 'isProjectionPlane', 'organiseBlueprints',
  'Blueprint', 'Blueprints', 'CompoundBlueprint', 'BlueprintSketcher', 'BaseBlueprint', 'Curve2D', 'BoundingBox2d',
  'ProjectionCamera', 'drawProjection', 'makeProjectedEdges', 'lookFromPlane', 'DistanceQuery', 'DistanceTool',
  'LinearPhysicalProperties', 'SurfacePhysicalProperties', 'VolumePhysicalProperties', 'FaceSketcher',
  'Sketcher', 'Transformation', 'Surface', 'Curve', 'combineFinderFilters', 'atShapeExtremum',
  'fuseBlueprints', 'cutBlueprints', 'intersectBlueprints', 'polysidesBlueprint', 'roundedRectangleBlueprint',
  'ManifoldBox', 'ManifoldInstance', 'ManifoldMesh', 'ManifoldVec3', 'FaceTriangulation', 'FaceUVBounds', 'TopologyMap',
  'TopoEntity', 'SurfaceType', 'CurveType', 'AXIS_NAMES', 'Vector', 'axis2d', 'asDir', 'asPnt', 'makeAx1', 'makeAx2',
  'makeAx3', 'makePln', 'makeDirVector', 'makeDirection', 'resolveDirection', 'PlaneFace', 'supportExtrude',
]);

const src = readFileSync(dtsPath, 'utf8').replace(/\r\n/g, '\n');
const lines = src.split('\n');

const depthDelta = (text) => {
  let d = 0;
  for (const ch of text) {
    if ('({['.includes(ch)) d += 1;
    else if (')}]'.includes(ch)) d -= 1;
  }
  return d;
};

// Split into top-level statements, remembering the JSDoc that precedes each.
const statements = [];
let doc = [];
for (let i = 0; i < lines.length; ) {
  const line = lines[i];
  if (line.startsWith('/**')) {
    doc = [];
    while (i < lines.length) {
      doc.push(lines[i]);
      if (lines[i].includes('*/')) break;
      i += 1;
    }
    i += 1;
    continue;
  }
  if (/^(export )?declare /.test(line)) {
    const block = [];
    let depth = 0;
    let inComment = false;
    while (i < lines.length) {
      const l = lines[i];
      block.push(l);
      // Ignore JSDoc text when balancing brackets (it often contains stray parentheses).
      const trimmed = l.trim();
      if (inComment || trimmed.startsWith('/**') || trimmed.startsWith('/*')) {
        inComment = !trimmed.includes('*/');
        i += 1;
        continue;
      }
      depth += depthDelta(l);
      i += 1;
      if (depth <= 0 && /[;}]\s*$/.test(l)) break;
    }
    statements.push({ doc, text: block.join('\n') });
    doc = [];
    continue;
  }
  if (line.trim() !== '') doc = [];
  i += 1;
}

const firstDocLine = (docLines) => {
  const cleaned = docLines
    .map((l) => l.replace(/^\s*\/\*\*+\s?/, '').replace(/\s*\*\/\s*$/, '').replace(/^\s*\*\s?/, '').trim())
    .filter((l) => l && !l.startsWith('@'));
  return cleaned[0] ?? '';
};
const squash = (s) => s.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();

const out = { classes: [], functions: [], types: [] };

for (const { doc: d, text } of statements) {
  const head = text.match(/^(?:export )?declare (abstract class|class|function|const|type|interface|enum) ([A-Za-z0-9_$]+)/);
  if (!head) continue;
  const [, kind, name] = head;
  if (EXCLUDE.has(name)) continue;

  if (kind === 'class' || kind === 'abstract class') {
    const bodyStart = text.indexOf('{');
    const header = squash(text.slice(0, bodyStart)).replace(/^(export )?declare /, '');
    const body = text.slice(bodyStart + 1, text.lastIndexOf('}')).split('\n');
    const members = [];
    let memberDoc = [];
    for (let j = 0; j < body.length; ) {
      const l = body[j];
      if (l.trim().startsWith('/**')) {
        memberDoc = [];
        while (j < body.length) {
          memberDoc.push(body[j]);
          if (body[j].includes('*/')) break;
          j += 1;
        }
        j += 1;
        continue;
      }
      if (l.trim() === '') {
        j += 1;
        continue;
      }
      const chunk = [l];
      let depth = depthDelta(l);
      j += 1;
      while (depth > 0 && j < body.length) {
        chunk.push(body[j]);
        depth += depthDelta(body[j]);
        j += 1;
      }
      const member = squash(chunk.join(' '));
      if (/^(private|protected|#)/.test(member)) {
        memberDoc = [];
        continue;
      }
      const note = firstDocLine(memberDoc);
      members.push(`  ${member}${note ? ` // ${note}` : ''}`);
      memberDoc = [];
    }
    out.classes.push(`${header} {\n${members.join('\n')}\n}`);
  } else if (kind === 'function' || kind === 'const') {
    const note = firstDocLine(d);
    out.functions.push(`${squash(text).replace(/^(export )?declare /, '')}${note ? ` // ${note}` : ''}`);
  } else {
    out.types.push(squash(text).replace(/^(export )?declare /, ''));
  }
}

const reference = [
  '// ---- CLASSES (methods of the objects you get back) ----',
  out.classes.join('\n\n'),
  '',
  '// ---- FUNCTIONS / CONSTANTS (destructure from the `replicad` argument) ----',
  out.functions.join('\n'),
  '',
  '// ---- TYPES / OPTION OBJECTS ----',
  out.types.join('\n'),
].join('\n');

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  `// AUTO-GENERATED by scripts/gen-replicad-api.mjs from node_modules/replicad — do not edit by hand.\n// Re-run \`npm run gen:replicad-api\` after upgrading replicad.\nexport const REPLICAD_API_REFERENCE = ${JSON.stringify(reference)};\n`,
);
console.log(`Wrote ${outPath}: ${out.classes.length} classes, ${out.functions.length} functions/consts, ${out.types.length} types, ${reference.length} chars`);
