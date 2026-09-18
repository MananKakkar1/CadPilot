export type AgentId =
  | 'intent-parser'
  | 'design-planner'
  | 'cad-builder'
  | 'geometry-evaluator';

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface DesignIntent {
  objectType: 'spur-gear' | 'phone-stand';
  name: string;
  parameters: Record<string, number | string>;
  constraints: string[];
  sourcePrompt: string;
}

export interface DesignPlan {
  intent: DesignIntent;
  operations: Array<{
    id: string;
    label: string;
    kind: 'profile' | 'boolean' | 'extrude' | 'evaluate';
    inputs: string[];
    parameters?: Record<string, number | string>;
  }>;
}

export interface CadBuildResult {
  modelId: string;
  adapter: 'mock' | 'replicad';
  mesh?: { vertices: number[]; triangles: number[] };
  metrics: Record<string, number | string | boolean>;
  exports: { step?: Blob; stl?: Blob };
}

export interface GeometryEvaluation {
  score: number;
  valid: boolean;
  breakdown: Record<string, number>;
  warnings: string[];
}

export interface AgentContext {
  runId: string;
  prompt: string;
  signal: AbortSignal;
  emit: (event: HarnessEvent) => void;
}

export interface AgentInputMap {
  'intent-parser': { prompt: string };
  'design-planner': DesignIntent;
  'cad-builder': DesignPlan;
  'geometry-evaluator': CadBuildResult;
}

export interface AgentOutputMap {
  'intent-parser': DesignIntent;
  'design-planner': DesignPlan;
  'cad-builder': CadBuildResult;
  'geometry-evaluator': GeometryEvaluation;
}

export interface HarnessEvent {
  runId: string;
  timestamp: string;
  type: 'run' | 'agent' | 'artifact' | 'error';
  status: RunStatus | 'started' | 'completed';
  agentId?: AgentId;
  message: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface Agent<Id extends AgentId> {
  id: Id;
  run(input: AgentInputMap[Id], context: AgentContext): Promise<AgentOutputMap[Id]>;
}

export interface HarnessResult {
  runId: string;
  status: RunStatus;
  intent?: DesignIntent;
  plan?: DesignPlan;
  build?: CadBuildResult;
  evaluation?: GeometryEvaluation;
  events: HarnessEvent[];
  error?: string;
}
