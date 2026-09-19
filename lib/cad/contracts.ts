export const MAX_PROMPT_LENGTH = 4_000;

export type DesignIntent = {
  object: string;
  units: 'mm';
  dimensions: Record<string, number | string>;
  constraints: string[];
  materials: string[];
  editInstruction?: string;
};

export type ParametricPlan = {
  summary: string;
  features: Array<{ name: string; operation: string; parameters: Record<string, number | string> }>;
  decision: string;
};

export type GeometryMetrics = {
  volume: number;
  surfaceArea: number;
  partCount: number;
  triangleCount: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
};

export type ValidationReport = { valid: boolean; score: number; findings: string[] };
export type AgentEventInput = { stage: string; agent: string; tool?: string; summary: string; detail?: Record<string, unknown>; durationMs?: number };

export function parsePrompt(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A design prompt is required.');
  const prompt = value.trim();
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH) throw new Error(`Prompt must be between 1 and ${MAX_PROMPT_LENGTH} characters.`);
  return prompt;
}

export function safeDecisionSummary(value: string): string {
  return value.replace(/(?:chain of thought|reasoning|thought process|system prompt)/gi, 'design rationale').slice(0, 420);
}
