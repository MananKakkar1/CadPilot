import type {
  AgentContext,
  AgentId,
  HarnessEvent,
  HarnessResult,
  RunStatus,
} from './types';
import { CadBuilderAgent, DesignPlannerAgent, GeometryEvaluatorAgent, IntentParserAgent } from './mock-agents';
import type { CadAdapter } from '../cad/adapter';

const now = () => performance.now();

export class AgentHarness {
  constructor(private readonly adapter: CadAdapter) {}

  async run(prompt: string, options: { signal?: AbortSignal; onEvent?: (event: HarnessEvent) => void } = {}): Promise<HarnessResult> {
    const runId = crypto.randomUUID();
    const events: HarnessEvent[] = [];
    const signal = options.signal ?? new AbortController().signal;
    const emit = (event: HarnessEvent) => { events.push(event); options.onEvent?.(event); };
    const context: AgentContext = { runId, prompt, signal, emit };
    const start = now();
    const step = async <Id extends AgentId, Output>(agentId: Id, action: () => Promise<Output>): Promise<Output> => {
      const stepStart = now();
      emit({ runId, timestamp: new Date().toISOString(), type: 'agent', status: 'started', agentId, message: `Running ${agentId}` });
      try {
        const output = await action();
        emit({ runId, timestamp: new Date().toISOString(), type: 'agent', status: 'completed', agentId, message: `${agentId} completed`, durationMs: Math.round(now() - stepStart) });
        return output;
      } catch (error) {
        emit({ runId, timestamp: new Date().toISOString(), type: 'error', status: 'failed', agentId, message: error instanceof Error ? error.message : String(error), durationMs: Math.round(now() - stepStart) });
        throw error;
      }
    };

    emit({ runId, timestamp: new Date().toISOString(), type: 'run', status: 'running', message: 'Agent run started' });
    try {
      const intent = await step('intent-parser', () => new IntentParserAgent().run({ prompt }, context));
      const plan = await step('design-planner', () => new DesignPlannerAgent().run(intent, context));
      const build = await step('cad-builder', () => new CadBuilderAgent(this.adapter).run(plan, context));
      const evaluation = await step('geometry-evaluator', () => new GeometryEvaluatorAgent().run(build, context));
      emit({ runId, timestamp: new Date().toISOString(), type: 'run', status: 'completed', message: 'Agent run completed', durationMs: Math.round(now() - start) });
      return { runId, status: 'completed', intent, plan, build, evaluation, events };
    } catch (error) {
      const status: RunStatus = signal.aborted ? 'cancelled' : 'failed';
      emit({ runId, timestamp: new Date().toISOString(), type: 'run', status, message: status === 'cancelled' ? 'Agent run cancelled' : 'Agent run failed', durationMs: Math.round(now() - start) });
      return { runId, status, events, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
