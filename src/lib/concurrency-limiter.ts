// Minimal, dependency-free concurrency limiter (p-limit equivalent).
//
// Create ONE limiter per external dependency at module scope and reuse it
// across every call site/request. That's the difference that matters here:
// a concurrency cap applied *inside* a single function call (e.g. a local
// worker-pool loop) only bounds fan-out within that one call — if N
// requests each independently run their own capped loop, the real
// concurrency is still N × cap. A module-level limiter bounds the TOTAL
// number of in-flight calls process-wide, no matter how many requests are
// using it at once.
export interface Limiter {
  <T>(fn: () => Promise<T>): Promise<T>;
  activeCount(): number;
  pendingCount(): number;
}

export function createLimiter(concurrency: number): Limiter {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("createLimiter: concurrency must be a positive integer");
  }

  let active = 0;
  const queue: Array<() => void> = [];

  function dequeue() {
    if (active >= concurrency) return;
    const task = queue.shift();
    if (task) task();
  }

  const limit = (<T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const task = () => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            dequeue();
          });
      };
      if (active < concurrency) task();
      else queue.push(task);
    });
  }) as Limiter;

  limit.activeCount = () => active;
  limit.pendingCount = () => queue.length;

  return limit;
}
