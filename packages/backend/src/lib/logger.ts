import { randomUUID } from 'node:crypto';
import { format } from 'node:util';
import type { IncomingMessage } from 'node:http';
import { pino, stdSerializers, stdTimeFunctions, type Logger, type LoggerOptions } from 'pino';
import { config } from '../config.js';
import { redactDeep, redactString, REDACTED } from './redact.js';

/**
 * One JSON logger for the API, the jobs and boot. Fastify uses it as its request logger, so every
 * line logged inside a request carries `reqId`.
 */
export function buildLoggerOptions(level: string = config.LOG_LEVEL): LoggerOptions {
  return {
    level,
    base: { service: 'lotto-backend', role: processRole() },
    timestamp: stdTimeFunctions.isoTime,
    // Fast path for the well-known places; formatters.log below catches the rest.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-mock-signature"]',
        'res.headers["set-cookie"]',
      ],
      censor: REDACTED,
    },
    // The message (and printf-style args) go through the same string scrub as field values
    hooks: {
      logMethod(args, method) {
        method.apply(this, args.map((a) => (typeof a === 'string' ? redactString(a) : a)) as Parameters<typeof method>);
      },
    },
    formatters: {
      // req / res / err are left to their serializers (walking a FastifyRequest would be slow and useless)
      log: (obj) => {
        const { req, res, err, ...rest } = obj;
        const out = redactDeep(rest) as Record<string, unknown>;
        if (req !== undefined) out.req = req;
        if (res !== undefined) out.res = res;
        if (err !== undefined) out.err = err; // redacted by its serializer, after pino reads the Error

        return out;
      },
    },
    serializers: {
      req: (req: { id: string; method: string; url: string; headers: Record<string, unknown>; ip?: string }) => ({
        id: req.id,
        method: req.method,
        url: redactString(req.url),
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      err: (err: unknown) => redactDeep(err instanceof Error ? stdSerializers.err(err) : err),
    },
  };
}

export function processRole(): 'all' | 'api' | 'worker' | 'none' {
  if (config.RUN_API && config.RUN_JOBS) return 'all';
  if (config.RUN_API) return 'api';
  if (config.RUN_JOBS) return 'worker';
  return 'none';
}

export const logger: Logger = pino(buildLoggerOptions(config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL));

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/;

/** Uses an incoming X-Request-Id when it looks sane (a proxy or a client set it), else a fresh UUID. */
export function genReqId(req: IncomingMessage): string {
  const header = req.headers['x-request-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value && REQUEST_ID.test(value) ? value : randomUUID();
}

/**
 * The business modules log with console.*. In production the console is routed into the JSON
 * logger, so those lines are structured and pass through the same redaction.
 */
export function routeConsoleToLogger(target: Logger = logger): void {
  const write = (level: 'info' | 'warn' | 'error' | 'debug') => (...args: unknown[]) => {
    const err = args.find((a): a is Error => a instanceof Error);
    const msg = redactString(format(...args.map((a) => (a instanceof Error ? a.message : a))));
    if (err) target[level]({ err }, msg);
    else target[level](msg);
  };
  console.log = write('info');
  console.info = write('info');
  console.warn = write('warn');
  console.error = write('error');
  console.debug = write('debug');
}
