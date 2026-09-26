/** A terminal job cannot receive worker writes, even if cancellation raced a phase. */
export class JobStoppedError extends Error {
  constructor() { super('The CAD job is no longer running.'); this.name = 'JobStoppedError'; }
}

export async function assertJobRunning(db, jobId) {
  const job = await db.buildJob.findUnique({ where: { id: jobId }, select: { status: true } });
  if (job?.status !== 'RUNNING') throw new JobStoppedError();
}

/**
 * The conditional update locks the job row until commit. Cancellation uses the
 * same row, so either cancellation or this transition wins, never both.
 * Only database writes belong in the callback; keep geometry and I/O outside.
 */
export async function withRunningJob(db, jobId, write) {
  return db.$transaction(async (tx) => {
    const locked = await tx.buildJob.updateMany({ where: { id: jobId, status: 'RUNNING' }, data: { status: 'RUNNING' } });
    if (locked.count !== 1) throw new JobStoppedError();
    return write(tx);
  });
}
