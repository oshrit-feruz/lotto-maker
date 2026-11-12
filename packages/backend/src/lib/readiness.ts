/**
 * Readiness: each dependency gets a probe with a timeout, all run in parallel. /ready returns 503
 * if any is down, so a load balancer stops routing to an instance that cannot serve requests.
 */

export type Probe = () => Promise<unknown>;

export interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  checks: Record<string, CheckResult>;
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function checkReadiness(
  probes: Record<string, Probe>,
  timeoutMs: number,
  now: () => number = Date.now,
): Promise<ReadinessReport> {
  const entries = await Promise.all(
    Object.entries(probes).map(async ([name, probe]): Promise<[string, CheckResult]> => {
      const started = now();
      try {
        await withTimeout(Promise.resolve().then(probe), timeoutMs);
        return [name, { ok: true, latencyMs: now() - started }];
      } catch (err) {
        // Only the message: a connection error can carry the connection string
        const message = err instanceof TimeoutError ? err.message : 'unavailable';
        return [name, { ok: false, latencyMs: now() - started, error: message }];
      }
    }),
  );
  const checks = Object.fromEntries(entries);
  return { status: entries.every(([, c]) => c.ok) ? 'ready' : 'not_ready', checks };
}
