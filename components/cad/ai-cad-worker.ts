import { meshHelpers, measureRawMesh, validateRawMesh, findDisconnectedParts, type RawMesh } from '../../lib/cad/mesh-helpers.mjs';

export type AiCadMesh = { vertices: number[]; triangles: number[]; normals: number[] };
export type AiCadPart = { mesh: AiCadMesh; name: string; color: string; volume: number; surfaceArea: number };
export type AiCadResult = { parts: AiCadPart[]; metrics: { volume: number; surfaceArea: number } };
type WorkerRequest = { id: number; code: string };
type WorkerResponse =
  | { id: number; type: 'progress'; part: AiCadPart; index: number; total: number }
  | { id: number; type: 'done'; result: AiCadResult }
  | { id: number; type: 'error'; error: string };

const DEFAULT_PALETTE = ['#e56e46', '#4f8fd6', '#6bbf7d', '#d6c34f', '#a76bd6', '#d64f8f', '#4fd6c3', '#d68f4f'];
const MAX_PARTS = 160;

let replicadReady: Promise<typeof import('replicad')> | null = null;
async function loadReplicad() {
  if (!replicadReady) {
    replicadReady = Promise.all([import('replicad'), import('replicad-opencascadejs')]).then(async ([replicad, openCascade]) => {
      replicad.setOC(await openCascade.default());
      makeTransformsNonConsuming(replicad);
      return replicad;
    });
  }
  return replicadReady;
}

// replicad's translate/rotate/scale/mirror return a NEW shape and delete the one they were called on, so generated
// code that reuses a variable (or discards the return value) crashes with "This object has been deleted".
// Make them operate on a clone instead: reuse then just works, and the original stays intact.
function makeTransformsNonConsuming(replicad: typeof import('replicad')) {
  const proto = (replicad.Shape as unknown as { prototype: Record<string, unknown> }).prototype;
  for (const method of ['translate', 'rotate', 'scale', 'mirror', 'translateX', 'translateY', 'translateZ']) {
    const original = proto[method] as (((...args: unknown[]) => unknown) & { __nonConsuming?: boolean }) | undefined;
    if (!original || original.__nonConsuming) continue;
    const wrapped = function (this: { clone: () => unknown }, ...args: unknown[]) {
      return original.apply(this.clone(), args);
    } as ((...args: unknown[]) => unknown) & { __nonConsuming?: boolean };
    wrapped.__nonConsuming = true;
    proto[method] = wrapped;
  }
}

type Extent = { min: [number, number, number]; max: [number, number, number] };

// Tessellation tolerance must scale with model size: 0.08 mm on a 4.6 m car means millions of triangles.
function pickMeshOptions(parts: Array<{ shape?: unknown; rawMesh?: RawMesh }>) {
  const extent: Extent = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const grow = (lo: number[], hi: number[]) => {
    for (let k = 0; k < 3; k += 1) {
      extent.min[k] = Math.min(extent.min[k], lo[k]);
      extent.max[k] = Math.max(extent.max[k], hi[k]);
    }
  };
  for (const part of parts) {
    if (part.rawMesh) {
      const v = part.rawMesh.vertices;
      for (let i = 0; i < v.length; i += 3) grow([v[i], v[i + 1], v[i + 2]], [v[i], v[i + 1], v[i + 2]]);
    } else if (part.shape) {
      try {
        const [lo, hi] = (part.shape as { boundingBox: { bounds: [number[], number[]] } }).boundingBox.bounds;
        grow(lo, hi);
      } catch {
        // a shape without a readable bounding box just doesn't influence the tolerance
      }
    }
  }
  const diagonal = Math.hypot(extent.max[0] - extent.min[0], extent.max[1] - extent.min[1], extent.max[2] - extent.min[2]);
  const size = Number.isFinite(diagonal) ? diagonal : 100;
  return { tolerance: Math.min(2, Math.max(0.05, size / 6000)), angularTolerance: 20 };
}

type RawPart = { shape?: unknown; rawMesh?: RawMesh; name?: string; color?: string };

function isSolidLike(value: unknown): value is { mesh: (options: unknown) => unknown } {
  return !!value && typeof (value as { mesh?: unknown }).mesh === 'function';
}

function isRawMesh(value: unknown): value is RawMesh {
  return !!value && typeof value === 'object' && Array.isArray((value as RawMesh).vertices) && Array.isArray((value as RawMesh).triangles);
}

// A part can be a replicad solid, a raw triangle mesh ({vertices, triangles}), or { shape | mesh, name?, color? }.
function normalizeParts(returned: unknown): RawPart[] {
  const entries = Array.isArray(returned) ? returned : [returned];
  if (entries.length === 0) throw new Error('Generated code did not return any shapes from main().');
  if (entries.length > MAX_PARTS) throw new Error(`Generated code returned ${entries.length} parts, which is more than the ${MAX_PARTS} allowed.`);

  return entries.map((entry, index) => {
    if (isSolidLike(entry)) return { shape: entry };
    if (isRawMesh(entry)) return { rawMesh: entry };
    if (entry && typeof entry === 'object') {
      const part = entry as RawPart & { mesh?: unknown };
      if (isSolidLike(part.shape)) return part;
      if (isRawMesh(part.mesh)) return { rawMesh: part.mesh, name: part.name, color: part.color };
      if (isRawMesh(part.shape)) return { rawMesh: part.shape, name: part.name, color: part.color };
    }
    throw new Error(`Part ${index} returned by main() is not a valid replicad solid or a raw { vertices, triangles } mesh.`);
  });
}

async function runGeneratedCode(id: number, code: string) {
  const replicad = await loadReplicad();
  // Pre-destructure every replicad export into scope, so generated code that uses a
  // function without explicitly destructuring it (a common small model mistake) still works.
  const exportNames = Object.keys(replicad).filter((name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name));
  const helperNames = Object.keys(meshHelpers).filter((name) => !exportNames.includes(name));
  const preamble = `const { ${exportNames.join(', ')} } = replicad;\nconst { ${helperNames.join(', ')} } = helpers;`;
  const factory = new Function('replicad', 'helpers', `"use strict";\n${preamble}\n${code}\nreturn main(replicad, helpers);`);
  // One merged object serves as both arguments, so a helper destructured from `replicad` (or an export from
  // `helpers`) still resolves instead of becoming undefined and shadowing the in-scope global.
  const api = { ...replicad, ...meshHelpers };
  const parts = normalizeParts(factory(api, api));
  const meshOptions = pickMeshOptions(parts);

  let totalVolume = 0;
  let totalSurfaceArea = 0;
  const meshedParts: AiCadPart[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const name = part.name ?? `part-${index + 1}`;
    let mesh: AiCadMesh;
    let volume: number;
    let surfaceArea: number;
    if (part.rawMesh) {
      validateRawMesh(part.rawMesh, `Part "${name}"`);
      const measured = measureRawMesh(part.rawMesh);
      mesh = { vertices: part.rawMesh.vertices, triangles: part.rawMesh.triangles, normals: [] };
      volume = Math.round(measured.volume);
      surfaceArea = Math.round(measured.surfaceArea);
    } else {
      const shape = part.shape as { mesh: (options: unknown) => AiCadMesh };
      const meshed = shape.mesh(meshOptions);
      mesh = { vertices: meshed.vertices, triangles: meshed.triangles, normals: meshed.normals };
      volume = Math.round(replicad.measureVolume(shape as never));
      surfaceArea = Math.round(replicad.measureArea(shape as never));
    }
    totalVolume += volume;
    totalSurfaceArea += surfaceArea;
    const meshedPart: AiCadPart = {
      mesh,
      name,
      color: part.color ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length],
      volume,
      surfaceArea,
    };
    meshedParts.push(meshedPart);
    self.postMessage({ id, type: 'progress', part: meshedPart, index, total: parts.length } satisfies WorkerResponse);
  }

  // A part positioned far from every other part is almost always a coordinate/rotation mistake in
  // the generated placement code, not an intentional design — nothing in a real assembly floats
  // disconnected from everything else. Fail so the studio's repair loop fixes it, instead of
  // silently shipping a broken-looking result as a "successful" build.
  const disconnected = findDisconnectedParts(meshedParts.map(({ name, mesh }) => ({ name, vertices: mesh.vertices })));
  if (disconnected.length > 0) {
    throw new Error(`These parts are disconnected from the rest of the assembly, which usually means their position/rotation math is wrong: ${disconnected.join(', ')}. Move them so they connect to the parts they attach to.`);
  }

  return {
    parts: meshedParts,
    metrics: { volume: Math.round(totalVolume), surfaceArea: Math.round(totalSurfaceArea) },
  } satisfies AiCadResult;
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    const result = await runGeneratedCode(data.id, data.code);
    self.postMessage({ id: data.id, type: 'done', result } satisfies WorkerResponse);
  } catch (error) {
    self.postMessage({ id: data.id, type: 'error', error: error instanceof Error ? error.message : String(error) } satisfies WorkerResponse);
  }
};
