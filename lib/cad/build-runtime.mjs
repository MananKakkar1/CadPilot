// Node-side build runtime for generated CAD code: sandboxed execution, forgiving replicad behaviour,
// multi-part + raw-mesh support, size-adaptive meshing and export (preview JSON, STL, STEP).
// Used by scripts/cad-agent-worker.mjs. Plain ESM so it runs under `node` without a TS toolchain.
import vm from 'node:vm';
import { meshHelpers, measureRawMesh, validateRawMesh, findDisconnectedParts } from './mesh-helpers.mjs';

export const MAX_PARTS = 160;
const MAX_TOTAL_TRIANGLES = 600_000;
const MAX_CODE_CHARS = 120_000;
const PALETTE = ['#e56e46', '#4f8fd6', '#6bbf7d', '#d6c34f', '#a76bd6', '#d64f8f', '#4fd6c3', '#d68f4f'];
const FORBIDDEN = /\b(?:require|import|process|globalThis|Function|eval|WebAssembly|fetch|XMLHttpRequest|setTimeout|setInterval|constructor)\b/;

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

/**
 * Makes replicad forgiving of two things generated code does constantly:
 *  1. translate/rotate/scale/mirror return a NEW shape and delete the receiver, so reusing a variable (or discarding
 *     the return value) throws "This object has been deleted". They now operate on a clone.
 *  2. fillet/chamfer/shell throw an opaque WebAssembly exception when the geometry can't support them
 *     (e.g. filleting every edge of a lofted car body). They are cosmetic, so the un-finished shape is kept.
 * Idempotent.
 */
export function hardenReplicad(replicad) {
  const shapeProto = replicad.Shape.prototype;
  for (const method of ['translate', 'rotate', 'scale', 'mirror', 'translateX', 'translateY', 'translateZ']) {
    const original = shapeProto[method];
    if (typeof original !== 'function' || original.__nonConsuming) continue;
    const wrapped = function (...args) {
      return original.apply(this.clone(), args);
    };
    wrapped.__nonConsuming = true;
    shapeProto[method] = wrapped;
  }
  for (const method of ['fillet', 'chamfer', 'shell']) {
    let owner = replicad.Solid.prototype;
    while (owner && !Object.prototype.hasOwnProperty.call(owner, method)) owner = Object.getPrototypeOf(owner);
    const original = owner?.[method];
    if (!owner || typeof original !== 'function' || original.__failSoft) continue;
    const wrapped = function (...args) {
      try {
        return original.apply(this, args);
      } catch (error) {
        hardenReplicad.skipped.push(`${method}() could not be computed for a shape and was skipped`);
        return this;
      }
    };
    wrapped.__failSoft = true;
    owner[method] = wrapped;
  }
}
hardenReplicad.skipped = [];

/** Human-readable message for errors that cross the WebAssembly boundary (whose real text is unavailable). */
export function describeError(error) {
  if (error instanceof Error) return error.message;
  if (typeof WebAssembly !== 'undefined' && error instanceof WebAssembly.Exception) {
    return 'The OpenCascade geometry kernel crashed while building this model. This is almost always invalid geometry in the generated code: a boolean on degenerate or self-intersecting shapes, a fillet/chamfer radius too large for its edge, a bad loft (mismatched sections), or a self-intersecting sweep.';
  }
  if (typeof WebAssembly !== 'undefined' && error instanceof WebAssembly.RuntimeError) return `A low-level WebAssembly error occurred while building the geometry: ${error.message}`;
  // Errors thrown inside the vm sandbox come from another realm, so `instanceof Error` is false for them.
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** Runs generated code in a locked-down VM context and returns whatever main(replicad, helpers) returns. */
export function runCode(code, replicad, { timeoutMs = 60_000 } = {}) {
  if (!code || code.length > MAX_CODE_CHARS) throw new Error(`Generated code is empty or larger than the ${MAX_CODE_CHARS.toLocaleString()} character limit.`);
  if (FORBIDDEN.test(stripComments(code))) throw new Error('Generated code violates the server execution policy (it uses a forbidden identifier such as require, import, process or eval).');
  // Replicad exports and mesh helpers are also plain globals, so code that forgets to destructure them still runs.
  // `replicad` and `helpers` are the same merged object, so a helper destructured from `replicad` (or an export
  // from `helpers`) still resolves instead of silently becoming undefined and shadowing the global.
  const api = Object.freeze({ ...replicad, ...meshHelpers });
  const sandbox = Object.freeze({ ...api, replicad: api, helpers: api, console: Object.freeze({ log() {}, warn() {} }) });
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  return new vm.Script(`'use strict'; ${code}\n;main(replicad, helpers);`).runInContext(context, { timeout: timeoutMs });
}

const isSolidLike = (value) => !!value && typeof value.mesh === 'function' && typeof value.boundingBox === 'object';
const isRawMesh = (value) => !!value && typeof value === 'object' && Array.isArray(value.vertices) && Array.isArray(value.triangles);

/** Accepts a solid, a raw {vertices, triangles} mesh, {shape|mesh, name?, color?}, or an array of those. */
export function normalizeParts(returned) {
  const entries = Array.isArray(returned) ? returned : [returned];
  if (entries.length === 0) throw new Error('Generated code did not return any shapes from main().');
  if (entries.length > MAX_PARTS) throw new Error(`Generated code returned ${entries.length} parts, which is more than the ${MAX_PARTS} allowed.`);
  return entries.map((entry, index) => {
    if (isSolidLike(entry)) return { shape: entry };
    if (isRawMesh(entry)) return { rawMesh: entry };
    if (entry && typeof entry === 'object') {
      if (isSolidLike(entry.shape)) return { shape: entry.shape, name: entry.name, color: entry.color };
      if (isRawMesh(entry.mesh)) return { rawMesh: entry.mesh, name: entry.name, color: entry.color };
      if (isRawMesh(entry.shape)) return { rawMesh: entry.shape, name: entry.name, color: entry.color };
    }
    throw new Error(`Part ${index} returned by main() is not a valid replicad solid or a raw { vertices, triangles } mesh.`);
  });
}

// Tessellation tolerance must scale with model size: 0.1 mm on a 4.6 m car means millions of triangles.
function pickMeshOptions(parts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const grow = (lo, hi) => {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], lo[k]);
      max[k] = Math.max(max[k], hi[k]);
    }
  };
  for (const part of parts) {
    if (part.rawMesh) {
      const v = part.rawMesh.vertices;
      for (let i = 0; i < v.length; i += 3) grow([v[i], v[i + 1], v[i + 2]], [v[i], v[i + 1], v[i + 2]]);
    } else {
      try {
        const [lo, hi] = part.shape.boundingBox.bounds;
        grow(lo, hi);
      } catch {
        // an unreadable bounding box just doesn't influence the tolerance
      }
    }
  }
  const diagonal = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const size = Number.isFinite(diagonal) ? diagonal : 100;
  return { tolerance: Math.min(2, Math.max(0.05, size / 6000)), angularTolerance: 20 };
}

function binaryStl(parts) {
  let triangleCount = 0;
  for (const part of parts) triangleCount += part.mesh.triangles.length / 3;
  const buffer = Buffer.alloc(84 + triangleCount * 50);
  buffer.write('Agentic CAD export', 0, 'ascii');
  buffer.writeUInt32LE(triangleCount, 80);
  let offset = 84;
  for (const { mesh } of parts) {
    const v = mesh.vertices;
    const t = mesh.triangles;
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length; ny /= length; nz /= length;
      for (const value of [nx, ny, nz, v[a], v[a + 1], v[a + 2], v[b], v[b + 1], v[b + 2], v[c], v[c + 1], v[c + 2]]) {
        buffer.writeFloatLE(value, offset);
        offset += 4;
      }
      buffer.writeUInt16LE(0, offset);
      offset += 2;
    }
  }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * Executes generated code and produces everything a revision needs. Individual parts that fail to mesh are skipped
 * (and reported in `warnings`); the build only fails if nothing usable remains.
 */
export async function buildFromCode(code, replicad) {
  hardenReplicad(replicad);
  hardenReplicad.skipped.length = 0;
  const rawParts = normalizeParts(runCode(code, replicad));
  const meshOptions = pickMeshOptions(rawParts);
  const warnings = [];

  const built = [];
  rawParts.forEach((part, index) => {
    const name = part.name || `part-${index + 1}`;
    const color = part.color || PALETTE[index % PALETTE.length];
    try {
      if (part.rawMesh) {
        validateRawMesh(part.rawMesh, `Part "${name}"`);
        const measured = measureRawMesh(part.rawMesh);
        built.push({ name, color, mesh: { vertices: part.rawMesh.vertices, triangles: part.rawMesh.triangles, normals: [] }, volume: measured.volume, surfaceArea: measured.surfaceArea, shape: null });
      } else {
        const mesh = part.shape.mesh(meshOptions);
        built.push({ name, color, mesh: { vertices: mesh.vertices, triangles: mesh.triangles, normals: mesh.normals }, volume: replicad.measureVolume(part.shape), surfaceArea: replicad.measureArea(part.shape), shape: part.shape });
      }
    } catch (error) {
      warnings.push(`Skipped part "${name}": ${describeError(error)}`);
    }
  });
  warnings.push(...new Set(hardenReplicad.skipped));
  if (built.length === 0) throw new Error(`No part could be built. ${warnings[0] ?? ''}`.trim());

  // A part positioned far from every other part is almost always a coordinate/rotation mistake in
  // the generated placement code, not an intentional design — nothing in a real assembly floats
  // disconnected from everything else. Fail the build so the caller's repair loop fixes it, instead
  // of silently shipping a broken-looking result as a "successful" build.
  const disconnected = findDisconnectedParts(built.map(({ name, mesh }) => ({ name, vertices: mesh.vertices })));
  if (disconnected.length > 0) {
    throw new Error(`These parts are disconnected from the rest of the assembly, which usually means their position/rotation math is wrong: ${disconnected.join(', ')}. Move them so they connect to the parts they attach to.`);
  }

  const triangleCount = built.reduce((sum, part) => sum + part.mesh.triangles.length / 3, 0);
  if (triangleCount > MAX_TOTAL_TRIANGLES) throw new Error(`Generated mesh has ${Math.round(triangleCount).toLocaleString()} triangles, over the ${MAX_TOTAL_TRIANGLES.toLocaleString()} limit.`);

  const volume = Math.round(built.reduce((sum, part) => sum + part.volume, 0));
  const surfaceArea = Math.round(built.reduce((sum, part) => sum + part.surfaceArea, 0));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { mesh } of built) {
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      for (let k = 0; k < 3; k += 1) {
        const value = mesh.vertices[i + k];
        if (value < min[k]) min[k] = value;
        if (value > max[k]) max[k] = value;
      }
    }
  }

  // Merged top-level mesh for single-mesh consumers, plus the per-part list (name/colour) for richer viewers.
  const merged = { vertices: [], triangles: [], normals: [] };
  const allHaveNormals = built.every((part) => part.mesh.normals.length === part.mesh.vertices.length);
  for (const { mesh } of built) {
    const offset = merged.vertices.length / 3;
    for (const value of mesh.vertices) merged.vertices.push(value);
    for (const index of mesh.triangles) merged.triangles.push(index + offset);
    if (allHaveNormals) for (const value of mesh.normals) merged.normals.push(value);
  }
  const preview = { ...merged, parts: built.map(({ name, color, mesh }) => ({ name, color, vertices: mesh.vertices, triangles: mesh.triangles, normals: mesh.normals })) };

  const solidParts = built.filter((part) => part.shape);
  let step = null;
  if (solidParts.length > 0) {
    try {
      step = new Uint8Array(await replicad.exportSTEP(solidParts.map(({ shape, name, color }) => ({ shape, name, color }))).arrayBuffer());
    } catch (error) {
      warnings.push(`STEP export skipped: ${describeError(error)}`);
    }
  }
  const rawCount = built.length - solidParts.length;
  const findings = [
    `${built.length} part${built.length === 1 ? '' : 's'} built (${solidParts.length} B-rep solid${solidParts.length === 1 ? '' : 's'}${rawCount ? `, ${rawCount} raw mesh${rawCount === 1 ? '' : 'es'}` : ''}).`,
    `Mesh is ${Math.round(triangleCount).toLocaleString()} triangles, within the configured limit.`,
    ...(rawCount ? ['Raw mesh parts are included in the STL and preview but not in the STEP file.'] : []),
    ...warnings,
  ];
  const valid = volume > 0 && triangleCount > 0;
  const metrics = { volume, surfaceArea, partCount: built.length, triangleCount: Math.round(triangleCount), bounds: { min, max } };
  const validation = { valid, score: valid ? Math.max(60, 100 - 10 * warnings.length) : 0, findings };
  return { metrics, validation, preview, stl: binaryStl(built), step, warnings, parts: built.map(({ shape, ...part }) => part) };
}
