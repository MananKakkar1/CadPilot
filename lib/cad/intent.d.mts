export type DesignIntent = {
  object: string;
  units: 'mm';
  dimensions: Record<string, number | string>;
  constraints: string[];
  materials: string[];
};

export type ParametricPlan = {
  summary: string;
  features: Array<{ name: string; operation: string; parameters: Record<string, number | string> }>;
  decision: string;
};

export function inferDesignIntent(prompt: string): DesignIntent;
export function buildParametricPlan(intent: DesignIntent): ParametricPlan;
