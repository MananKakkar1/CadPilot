import type { CadBuildResult, DesignPlan } from '../harness/types';

/**
 * Stable seam for the geometry implementation. The harness never imports
 * Replicad directly; the event-day worker can implement this interface.
 */
export interface CadAdapter {
  readonly name: CadBuildResult['adapter'];
  build(plan: DesignPlan, signal: AbortSignal): Promise<CadBuildResult>;
}

export class MockCadAdapter implements CadAdapter {
  readonly name = 'mock' as const;

  async build(plan: DesignPlan, signal: AbortSignal): Promise<CadBuildResult> {
    if (signal.aborted) throw new DOMException('Build cancelled', 'AbortError');
    const params = plan.intent.parameters;
    const teeth = Number(params.teeth ?? 20);
    const module = Number(params.module ?? 2);
    const boreDiameter = Number(params.boreDiameter ?? 10);
    const thickness = Number(params.thickness ?? 5);
    const pitchDiameter = teeth * module;

    return {
      modelId: `mock-${plan.intent.objectType}-${Date.now()}`,
      adapter: this.name,
      metrics: {
        pitchDiameter,
        outerDiameter: pitchDiameter + 2 * module,
        boreDiameter,
        thickness,
        volume: Math.PI * ((pitchDiameter / 2) ** 2 - (boreDiameter / 2) ** 2) * thickness,
        valid: teeth >= 8 && boreDiameter < pitchDiameter * 0.65,
      },
      exports: {},
    };
  }
}
