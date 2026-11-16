import { config } from '../config.js';
import { logger } from './logger.js';
import { redactDeep } from './redact.js';

/**
 * The one place unexpected errors are reported: 500s, failed jobs, unhandled rejections.
 *
 * Error monitoring is off by default. With SENTRY_DSN set, `initErrorReporting` loads `@sentry/node`
 * if it is installed (it is not a dependency: it is large, and the service runs fine without it).
 * To turn it on: `npm i @sentry/node -w packages/backend` and set SENTRY_DSN. Any other monitoring
 * tool can be wired in here instead; callers only ever use `reportError`.
 */

type Sink = (err: unknown, context: Record<string, unknown>) => void;

let sink: Sink | undefined;

export async function initErrorReporting(): Promise<void> {
  if (!config.SENTRY_DSN) return;
  // A variable, so TypeScript and the bundler do not require the package to exist
  const moduleName = '@sentry/node';
  try {
    const Sentry = (await import(moduleName)) as {
      init: (o: Record<string, unknown>) => void;
      captureException: (e: unknown, hint?: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn: config.SENTRY_DSN,
      environment: config.SENTRY_ENVIRONMENT ?? config.NODE_ENV,
      sendDefaultPii: false,
      beforeSend: (event: unknown) => redactDeep(event),
    });
    sink = (err, context) => Sentry.captureException(err, { extra: redactDeep(context) });
    logger.info('error reporting: Sentry enabled');
  } catch {
    logger.warn('SENTRY_DSN is set but @sentry/node is not installed; errors are only logged');
  }
}

/** Test seam. */
export function setErrorSink(next: Sink | undefined): void {
  sink = next;
}

export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  logger.error({ err, ...context }, err instanceof Error ? err.message : 'error');
  try {
    sink?.(err, context);
  } catch {
    // monitoring must never take the process down
  }
}
