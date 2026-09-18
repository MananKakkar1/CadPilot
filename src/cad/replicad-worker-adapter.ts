import type { CadBuildResult, DesignPlan } from '../harness/types';
import type { CadAdapter } from './adapter';

interface WorkerResponse {
  type: 'result' | 'error';
  requestId: string;
  result?: CadBuildResult;
  message?: string;
}

export class ReplicadWorkerAdapter implements CadAdapter {
  readonly name = 'replicad' as const;
  private readonly worker = new Worker(new URL('./replicad.worker.ts', import.meta.url), { type: 'module' });

  build(plan: DesignPlan, signal: AbortSignal): Promise<CadBuildResult> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        this.worker.postMessage({ type: 'cancel', requestId });
        reject(new DOMException('Build cancelled', 'AbortError'));
      };
      const onMessage = ({ data }: MessageEvent<WorkerResponse>) => {
        if (data.requestId !== requestId) return;
        signal.removeEventListener('abort', onAbort);
        if (data.type === 'error' || !data.result) reject(new Error(data.message ?? 'Replicad build failed'));
        else resolve(data.result);
      };
      this.worker.addEventListener('message', onMessage, { once: true });
      signal.addEventListener('abort', onAbort, { once: true });
      this.worker.postMessage({ type: 'build', requestId, plan });
    });
  }

  dispose(): void {
    this.worker.terminate();
  }
}
