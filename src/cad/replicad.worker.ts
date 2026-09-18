import { ReplicadCadAdapter } from './replicad-adapter';
import type { DesignPlan, CadBuildResult } from '../harness/types';

interface BuildMessage {
  type: 'build';
  requestId: string;
  plan: DesignPlan;
}

interface BuildResponse {
  type: 'result' | 'error';
  requestId: string;
  result?: CadBuildResult;
  message?: string;
}

const adapter = new ReplicadCadAdapter();

self.onmessage = async ({ data }: MessageEvent<BuildMessage>) => {
  if (data.type !== 'build') return;
  try {
    const result = await adapter.build(data.plan, new AbortController().signal);
    const response: BuildResponse = { type: 'result', requestId: data.requestId, result };
    self.postMessage(response);
  } catch (error) {
    const response: BuildResponse = {
      type: 'error',
      requestId: data.requestId,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
