import type { Logger } from 'pino';

export interface ShutdownStep {
  name: string;
  run: () => Promise<unknown>;
}

/**
 * Runs the steps in order, each one even if an earlier one failed, and gives up on the whole
 * sequence after `timeoutMs`. Returns true if every step finished in time.
 */
export async function runShutdown(steps: readonly ShutdownStep[], timeoutMs: number, log: Logger): Promise<boolean> {
  let clean = true;
  const sequence = (async () => {
    for (const step of steps) {
      const started = Date.now();
      try {
        await step.run();
        log.info({ step: step.name, durationMs: Date.now() - started }, `shutdown: ${step.name} closed`);
      } catch (err) {
        clean = false;
        log.error({ err, step: step.name }, `shutdown: ${step.name} failed`);
      }
    }
  })();
  let timer: NodeJS.Timeout | undefined;
  const timedOut = await Promise.race([
    sequence.then(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(true), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  if (timedOut) log.error({ timeoutMs }, 'shutdown: timed out');
  return clean && !timedOut;
}

/** SIGTERM / SIGINT run the shutdown once; a second signal exits at once. */
export function onShutdownSignal(handler: (signal: string) => Promise<void>, log: Logger): void {
  let shuttingDown = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      if (shuttingDown) {
        log.warn({ signal }, 'second signal, exiting now');
        process.exit(1);
      }
      shuttingDown = true;
      log.info({ signal }, 'shutting down');
      void handler(signal);
    });
  }
}
