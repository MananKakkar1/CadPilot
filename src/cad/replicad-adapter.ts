import {
  drawCircle,
  makeBox,
  measureShapeSurfaceProperties,
  measureShapeVolumeProperties,
  setOC,
} from 'replicad';
import type { Shape3D } from 'replicad';
import initOpenCascade from 'replicad-opencascadejs';
import wasmUrl from 'replicad-opencascadejs/wasm?url';
import type { CadBuildResult, DesignPlan } from '../harness/types';
import type { CadAdapter } from './adapter';

let runtimePromise: Promise<void> | undefined;

async function ensureReplicadRuntime(): Promise<void> {
  runtimePromise ??= initOpenCascade({ locateFile: () => wasmUrl }).then((oc) => {
    setOC(oc);
  });
  return runtimePromise;
}

function buildSpurGear(plan: DesignPlan) {
  const params = plan.intent.parameters;
  const teeth = Number(params.teeth ?? 20);
  const module = Number(params.module ?? 2);
  const boreDiameter = Number(params.boreDiameter ?? 10);
  const thickness = Number(params.thickness ?? 5);
  const pitchRadius = (module * teeth) / 2;
  const rootRadius = Math.max(module, pitchRadius - 1.25 * module);
  const outerRadius = pitchRadius + module;
  const toothWidth = Math.max(module * 0.9, (Math.PI * pitchRadius) / teeth * 0.55);

  let solid: Shape3D = drawCircle(rootRadius).sketchOnPlane().extrude(thickness) as Shape3D;
  for (let index = 0; index < teeth; index += 1) {
    const angle = (index * 360) / teeth;
    const tooth = makeBox(
      [rootRadius, -toothWidth / 2, 0],
      [outerRadius, toothWidth / 2, thickness],
    ).rotate(angle, [0, 0, 0], [0, 0, 1]);
    solid = solid.fuse(tooth) as Shape3D;
  }

  const bore: Shape3D = drawCircle(boreDiameter / 2).sketchOnPlane().extrude(thickness) as Shape3D;
  return solid.cut(bore) as Shape3D;
}

/** Real OpenCascade-backed implementation used by the worker. */
export class ReplicadCadAdapter implements CadAdapter {
  readonly name = 'replicad' as const;

  async build(plan: DesignPlan, signal: AbortSignal): Promise<CadBuildResult> {
    await ensureReplicadRuntime();
    if (signal.aborted) throw new DOMException('Build cancelled', 'AbortError');

    const shape = buildSpurGear(plan);
    const mesh = shape.mesh({ tolerance: 1e-3, angularTolerance: 0.1 });
    const volume = measureShapeVolumeProperties(shape).volume;
  const surfaceArea = measureShapeSurfaceProperties(shape).area;
    const params = plan.intent.parameters;

    return {
      modelId: `replicad-${plan.intent.objectType}-${Date.now()}`,
      adapter: this.name,
      mesh: { vertices: mesh.vertices, triangles: mesh.triangles },
      metrics: {
        volume,
        surfaceArea,
        faceCount: shape.faces.length,
        edgeCount: shape.edges.length,
        pitchDiameter: Number(params.teeth ?? 20) * Number(params.module ?? 2),
        boreDiameter: Number(params.boreDiameter ?? 10),
        thickness: Number(params.thickness ?? 5),
        valid: volume > 0,
      },
      exports: {
        step: shape.blobSTEP(),
        stl: shape.blobSTL({ binary: true, tolerance: 1e-3, angularTolerance: 0.1 }),
      },
    };
  }
}
