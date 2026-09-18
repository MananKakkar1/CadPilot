import type { CadModelId, CadModelResult } from './replicad-models';

let ready: Promise<void> | null = null;
async function ensureReplicad() {
  if (!ready) ready = Promise.all([import('replicad'), import('replicad-opencascadejs')]).then(async ([replicad, module]) => { const init = typeof module.default === 'function' ? module.default : module; replicad.setOC(await (init as () => Promise<any>)()); });
  await ready;
}

export async function generateLandingModel(model: CadModelId): Promise<CadModelResult> {
  await ensureReplicad();
  const { makeBox, makeCylinder, measureArea, measureVolume } = await import('replicad');
  const values = { teeth: 20, module: 2, bore: 10, thickness: 5, tilt: 68, width: 72, height: 92 };
  let shape: any;
  if (model === 'spur-gear') {
    const outer = values.teeth * values.module * 0.55 + values.module;
    shape = makeCylinder(outer, values.thickness);
    for (let i = 0; i < values.teeth; i += 1) {
      const angle = (i / values.teeth) * Math.PI * 2; const tooth = values.module * 0.9;
      const x = Math.cos(angle) * (outer - tooth / 2); const y = Math.sin(angle) * (outer - tooth / 2);
      shape = shape.fuse(makeBox([x - tooth / 2, y - tooth / 2, 0], [x + tooth / 2, y + tooth / 2, values.thickness]));
    }
    shape = shape.cut(makeCylinder(Math.max(values.bore * 0.32, outer * 0.28), values.thickness + 0.2, [0, 0, -0.1]));
  } else {
    const width = values.width / 10; const height = values.height / 10;
    shape = makeBox([-width / 2, -3, 0], [width / 2, 3, 3]).fuse(makeBox([-width / 2, 0, 0], [width / 2, 3, height])).fuse(makeBox([-width / 2, 0, 0], [width / 2, height * 0.6, 3]));
  }
  const mesh = shape.mesh({ tolerance: 0.08, angularTolerance: 20 });
  return { mesh: { vertices: mesh.vertices, triangles: mesh.triangles, normals: mesh.normals }, metrics: { volume: Math.round(measureVolume(shape)), surfaceArea: Math.round(measureArea(shape)), valid: true }, label: `Replicad solid · ${model === 'spur-gear' ? 'spur gear' : 'phone stand'}` };
}
