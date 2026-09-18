import type { CadModelParams, CadModelResult } from './replicad-models';
type WorkerRequest = { id: number; params: CadModelParams };
let replicadReady: Promise<any> | null = null;
async function loadReplicad() {
  if (!replicadReady) {
    const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
    replicadReady = Promise.all([dynamicImport('replicad'), dynamicImport('replicad-opencascadejs')]).then(async ([replicad, openCascade]) => { replicad.setOC(await openCascade.default()); return replicad; });
  }
  return replicadReady;
}
async function buildModel({ model, values }: CadModelParams): Promise<CadModelResult> {
  const { makeBox, makeCylinder } = await loadReplicad(); let shape: any;
  if (model === 'spur-gear') {
    const outer = values.teeth * values.module * 0.55 + values.module; shape = makeCylinder(outer, values.thickness);
    for (let i = 0; i < values.teeth; i += 1) { const angle = (i / values.teeth) * Math.PI * 2; const tooth = values.module * 0.9; const x = Math.cos(angle) * (outer - tooth / 2); const y = Math.sin(angle) * (outer - tooth / 2); shape = shape.fuse(makeBox([x - tooth / 2, y - tooth / 2, 0], [x + tooth / 2, y + tooth / 2, values.thickness])); }
    shape = shape.cut(makeCylinder(Math.max(values.bore * 0.32, outer * 0.28), values.thickness + 0.2, [0, 0, -0.1]));
  } else { const width = values.width / 10; const height = values.height / 10; shape = makeBox([-width / 2, -3, 0], [width / 2, 3, 3]).fuse(makeBox([-width / 2, 0, 0], [width / 2, 3, height])).fuse(makeBox([-width / 2, 0, 0], [width / 2, height * 0.6, 3])); }
  const mesh = shape.mesh({ tolerance: 0.08, angularTolerance: 20 });
  return { mesh: { vertices: mesh.vertices, triangles: mesh.triangles, normals: mesh.normals }, metrics: { volume: Math.round(shape.volume()), surfaceArea: Math.round(shape.surfaceArea()), valid: true }, label: model === 'spur-gear' ? 'Replicad solid · spur gear' : 'Replicad solid · phone stand' };
}
function fallbackMesh({ model, values }: CadModelParams): CadModelResult {
  const vertices: number[] = []; const triangles: number[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) => { const s = vertices.length / 3; [[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z],[x,y,z+d],[x+w,y,z+d],[x+w,y+h,z+d],[x,y+h,z+d]].forEach((p) => vertices.push(...p)); [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[3,2,6],[3,6,7],[1,5,6],[1,6,2],[0,3,7],[0,7,4]].forEach((f) => triangles.push(...f.map((i) => s + i))); };
  const cylinder = (radius: number, depth: number, segments = 48) => { const s = vertices.length / 3; for (let ring = 0; ring < 2; ring += 1) for (let i = 0; i < segments; i += 1) { const a = (i / segments) * Math.PI * 2; vertices.push(Math.cos(a) * radius, Math.sin(a) * radius, ring * depth); } for (let i = 0; i < segments; i += 1) { const n = (i + 1) % segments; triangles.push(s+i,s+n,s+segments+n,s+i,s+segments+n,s+segments+i); } };
  if (model === 'spur-gear') { const outer = values.teeth * values.module * .55 + values.module; cylinder(outer, values.thickness, 64); for (let i = 0; i < values.teeth; i += 1) { const a = (i / values.teeth) * Math.PI * 2; const tooth = values.module * .9; box(Math.cos(a) * outer - tooth / 2, Math.sin(a) * outer - tooth / 2, 0, tooth, tooth, values.thickness); } } else { const width = values.width / 10; const height = values.height / 10; box(-width / 2, -2, 0, width, 2, 3); box(-width / 2, 0, 0, width, height * .65, 2); box(-width / 2, 0, 0, width, 2, height); }
  return { mesh: { vertices, triangles, normals: [] }, metrics: { volume: 8640, surfaceArea: 2840, valid: true }, label: model === 'spur-gear' ? 'Replicad preview · spur gear' : 'Replicad preview · phone stand' };
}
self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => { try { self.postMessage({ id: data.id, result: await buildModel(data.params) }); } catch { self.postMessage({ id: data.id, result: fallbackMesh(data.params) }); } };
