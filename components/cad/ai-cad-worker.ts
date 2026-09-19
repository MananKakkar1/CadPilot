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
      return replicad;
    });
  }
  return replicadReady;
}

type RawPart = { shape?: unknown; name?: string; color?: string };

function isSolidLike(value: unknown): value is { mesh: (options: unknown) => unknown } {
  return !!value && typeof (value as { mesh?: unknown }).mesh === 'function';
}

function normalizeParts(returned: unknown): RawPart[] {
  const entries = Array.isArray(returned) ? returned : [returned];
  if (entries.length === 0) throw new Error('Generated code did not return any shapes from main().');
  if (entries.length > MAX_PARTS) throw new Error(`Generated code returned ${entries.length} parts, which is more than the ${MAX_PARTS} allowed.`);

  return entries.map((entry, index) => {
    if (isSolidLike(entry)) return { shape: entry };
    if (entry && typeof entry === 'object' && isSolidLike((entry as RawPart).shape)) return entry as RawPart;
    throw new Error(`Part ${index} returned by main() is not a valid replicad solid (and has no .shape solid).`);
  });
}

async function runGeneratedCode(id: number, code: string) {
  const replicad = await loadReplicad();
  // Pre-destructure every replicad export into scope, so generated code that uses a
  // function without explicitly destructuring it (a common small model mistake) still works.
  const exportNames = Object.keys(replicad).filter((name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name));
  const preamble = `const { ${exportNames.join(', ')} } = replicad;`;
  const factory = new Function('replicad', `"use strict";\n${preamble}\n${code}\nreturn main(replicad);`);
  const parts = normalizeParts(factory(replicad));

  let totalVolume = 0;
  let totalSurfaceArea = 0;
  const meshedParts: AiCadPart[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const shape = part.shape as { mesh: (options: unknown) => { vertices: number[]; triangles: number[]; normals: number[] } };
    const mesh = shape.mesh({ tolerance: 0.08, angularTolerance: 20 });
    const volume = Math.round(replicad.measureVolume(shape as never));
    const surfaceArea = Math.round(replicad.measureArea(shape as never));
    totalVolume += volume;
    totalSurfaceArea += surfaceArea;
    const meshedPart: AiCadPart = {
      mesh: { vertices: mesh.vertices, triangles: mesh.triangles, normals: mesh.normals },
      name: part.name ?? `part-${index + 1}`,
      color: part.color ?? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length],
      volume,
      surfaceArea,
    };
    meshedParts.push(meshedPart);
    self.postMessage({ id, type: 'progress', part: meshedPart, index, total: parts.length } satisfies WorkerResponse);
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
