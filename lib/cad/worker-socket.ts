import net from 'node:net';

const host = process.env.CAD_WORKER_HOST ?? '127.0.0.1';
const port = Number(process.env.CAD_WORKER_PORT ?? 3020);

/** Wake the local CAD worker without making the database queue the hot path. */
export function notifyCadWorker(jobId: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (connected: boolean) => {
      if (settled) return;
      settled = true;
      resolve(connected);
    };
    let socket: net.Socket;
    try {
      socket = net.createConnection({ host, port });
    } catch {
      // The database job already exists; a bad/unavailable wake-up transport
      // must not turn a committed submission into an apparent failed request.
      finish(false);
      return;
    }
    socket.setTimeout(750);
    socket.once('connect', () => {
      socket.end(`${JSON.stringify({ type: 'run', jobId })}\n`);
      finish(true);
    });
    socket.once('error', () => finish(false));
    socket.once('close', () => finish(false));
    socket.once('timeout', () => {
      socket.destroy();
      finish(false);
    });
  });
}
