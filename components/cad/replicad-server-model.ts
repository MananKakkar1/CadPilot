import type { CadModelId, CadModelResult } from './replicad-models';
import { buildLandingShape } from './landing-model-builders';

let ready: Promise<void> | null = null;
async function ensureReplicad() {
  if (!ready) ready = Promise.all([import('replicad'), import('replicad-opencascadejs')]).then(async ([replicad, module]) => { const init = typeof module.default === 'function' ? module.default : module; replicad.setOC(await (init as () => Promise<any>)()); });
  await ready;
}

export async function generateLandingModel(model: CadModelId): Promise<CadModelResult> {
  await ensureReplicad();
  const { makeBox, makeCylinder, makeSphere, measureArea, measureVolume } = await import('replicad');
  const values = { teeth: 20, module: 2, bore: 10, thickness: 5, tilt: 68, width: 72, height: 92 };
  const shape = buildLandingShape({ makeBox, makeCylinder, makeSphere }, model, values);
  const mesh = shape.mesh({ tolerance: 0.08, angularTolerance: 20 });
  return { mesh: { vertices: mesh.vertices, triangles: mesh.triangles, normals: mesh.normals }, metrics: { volume: Math.round(measureVolume(shape)), surfaceArea: Math.round(measureArea(shape)), valid: true }, label: `Replicad solid · ${model.replaceAll('-', ' ')}` };
}
