// Sends made while the phone is offline wait here and go out, in order, as
// soon as it is back online (services/network.ts calls flush). Text messages
// use it (app/chat/[id].tsx): the bubble stays with a clock and "Waiting for
// network" until it is sent. Pure logic, tested in services/__tests__.

export type QueuedJob = {
  id: string;
  /** What it is for (the chat id), so a screen can show its own waiting items. */
  scope: string;
  run: () => Promise<void>;
  /** A send that failed for a reason other than the network: not retried. */
  onGiveUp?: (error: unknown) => void;
};

type Listener = (jobs: readonly QueuedJob[]) => void;

export function createQueue(isNetworkError: (error: unknown) => boolean) {
  let jobs: QueuedJob[] = [];
  let flushing = false;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l(jobs));

  return {
    enqueue(job: QueuedJob) {
      jobs = [...jobs, job];
      emit();
    },
    size: () => jobs.length,
    pending: (scope?: string) => (scope ? jobs.filter((j) => j.scope === scope) : jobs),
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Run the jobs in order; stop at the first network failure (still offline). */
    async flush() {
      if (flushing) return;
      flushing = true;
      try {
        while (jobs.length) {
          const job = jobs[0];
          try {
            await job.run();
          } catch (error) {
            if (isNetworkError(error)) return;
            job.onGiveUp?.(error);
          }
          jobs = jobs.slice(1);
          emit();
        }
      } finally {
        flushing = false;
      }
    },
  };
}
