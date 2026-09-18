import type { CadAdapter } from '../cad/adapter';
import type {
  Agent,
  AgentContext,
  AgentInputMap,
  AgentOutputMap,
  DesignIntent,
  DesignPlan,
} from './types';

const numberFrom = (prompt: string, pattern: RegExp, fallback: number) =>
  Number(prompt.match(pattern)?.[1] ?? fallback);

export class IntentParserAgent implements Agent<'intent-parser'> {
  readonly id = 'intent-parser' as const;

  async run(input: AgentInputMap['intent-parser'], context: AgentContext): Promise<DesignIntent> {
    if (context.signal.aborted) throw new DOMException('Run cancelled', 'AbortError');
    const prompt = input.prompt.trim();
    const objectType = /phone\s*stand/i.test(prompt) ? 'phone-stand' : 'spur-gear';
    return {
      objectType,
      name: objectType === 'spur-gear' ? 'Spur gear' : 'Phone stand',
      parameters:
        objectType === 'spur-gear'
          ? {
              teeth: numberFrom(prompt, /(\d+)\s*teeth?/i, 20),
              module: numberFrom(prompt, /module\s*([\d.]+)/i, 2),
              boreDiameter: numberFrom(prompt, /(?:bore|hole)[^\d]*(\d+(?:\.\d+)?)\s*mm/i, 10),
              thickness: numberFrom(prompt, /thickness[^\d]*(\d+(?:\.\d+)?)\s*mm/i, 5),
            }
          : { width: 80, height: 110, tilt: 65 },
      constraints: [],
      sourcePrompt: prompt,
    };
  }
}

export class DesignPlannerAgent implements Agent<'design-planner'> {
  readonly id = 'design-planner' as const;

  async run(intent: AgentInputMap['design-planner'], _context: AgentContext): Promise<DesignPlan> {
    const operations =
      intent.objectType === 'spur-gear'
        ? [
            { id: 'params', label: 'Gear parameters', kind: 'profile' as const, inputs: [] },
            { id: 'teeth', label: 'Tooth profile', kind: 'profile' as const, inputs: ['params'] },
            { id: 'bore', label: 'Center bore', kind: 'boolean' as const, inputs: ['teeth'] },
            { id: 'extrude', label: 'Extrusion', kind: 'extrude' as const, inputs: ['bore'] },
          ]
        : [
            { id: 'base', label: 'Base profile', kind: 'profile' as const, inputs: [] },
            { id: 'support', label: 'Support angle', kind: 'extrude' as const, inputs: ['base'] },
          ];
    return { intent, operations: [...operations, { id: 'evaluation', label: 'Evaluation', kind: 'evaluate', inputs: [operations.at(-1)!.id] }] };
  }
}

export class CadBuilderAgent implements Agent<'cad-builder'> {
  readonly id = 'cad-builder' as const;
  constructor(private readonly adapter: CadAdapter) {}

  run(plan: AgentInputMap['cad-builder'], _context: AgentContext): Promise<AgentOutputMap['cad-builder']> {
    return this.adapter.build(plan, _context.signal);
  }
}

export class GeometryEvaluatorAgent implements Agent<'geometry-evaluator'> {
  readonly id = 'geometry-evaluator' as const;

  async run(build: AgentInputMap['geometry-evaluator'], _context: AgentContext): Promise<AgentOutputMap['geometry-evaluator']> {
    const valid = build.metrics.valid === true;
    const bore = Number(build.metrics.boreDiameter ?? 0);
    const pitch = Number(build.metrics.pitchDiameter ?? 1);
    const validity = valid ? 40 : 10;
    const specMatch = valid ? 30 : 18;
    const manufacturability = bore < pitch * 0.5 ? 20 : 12;
    const symmetry = 10;
    return {
      valid,
      score: validity + specMatch + manufacturability + symmetry,
      breakdown: { validity, specMatch, manufacturability, symmetry },
      warnings: valid ? [] : ['Bore diameter is too large for the current gear hub.'],
    };
  }
}
