import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config.js';

const key32 = () => Buffer.alloc(32, 7).toString('base64');

/** A production env that passes; each test removes or breaks one thing. */
function prodEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@db:5432/lotto',
    REDIS_URL: 'redis://redis:6379',
    JWT_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    ID_ENCRYPTION_KEY: key32(),
    ID_HASH_KEY: Buffer.alloc(32, 9).toString('base64'),
    PAYMENT_WEBHOOK_SECRET: 'w'.repeat(32),
    CHECKOUT_RETURN_ORIGINS: 'https://lotto.example',
    ALLOWED_ORIGINS: 'https://lotto.example,https://admin.lotto.example',
    PUBLIC_API_URL: 'https://api.lotto.example',
    BUSINESS_NAME: 'Example Ltd',
    BUSINESS_ID: '515555555',
    BUSINESS_ADDRESS: '1 Example St, Tel Aviv',
    ...overrides,
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return env;
}

function errorsOf(env: NodeJS.ProcessEnv): string[] {
  const r = loadConfig(env);
  return r.ok ? [] : r.errors;
}

describe('loadConfig: production secrets', () => {
  it('accepts a complete production env', () => {
    const r = loadConfig(prodEnv());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.ALLOWED_ORIGINS).toEqual(['https://lotto.example', 'https://admin.lotto.example']);
    expect(r.config.TRUST_PROXY_HOPS).toBe(1);
    expect(r.config.ENABLE_API_DOCS).toBe(false);
    expect(r.config.RUN_API).toBe(true);
    expect(r.config.RUN_JOBS).toBe(true);
  });

  it('lists every missing secret at once', () => {
    const errors = errorsOf(
      prodEnv({
        ID_ENCRYPTION_KEY: undefined,
        ID_HASH_KEY: undefined,
        PAYMENT_WEBHOOK_SECRET: undefined,
        CHECKOUT_RETURN_ORIGINS: undefined,
        ALLOWED_ORIGINS: undefined,
        BUSINESS_NAME: undefined,
        BUSINESS_ID: '  ',
        BUSINESS_ADDRESS: undefined,
        REDIS_URL: undefined,
        PUBLIC_API_URL: undefined,
      }),
    );
    const names = errors.map((e) => e.split(' ')[0]);
    expect(names).toEqual(
      expect.arrayContaining([
        'ID_ENCRYPTION_KEY',
        'ID_HASH_KEY',
        'PAYMENT_WEBHOOK_SECRET',
        'CHECKOUT_RETURN_ORIGINS',
        'ALLOWED_ORIGINS',
        'BUSINESS_NAME',
        'BUSINESS_ID',
        'BUSINESS_ADDRESS',
        'REDIS_URL',
        'PUBLIC_API_URL',
      ]),
    );
    expect(errors).toHaveLength(10);
  });

  it('requires long, distinct JWT secrets', () => {
    expect(errorsOf(prodEnv({ JWT_SECRET: 'x'.repeat(20) }))).toEqual([
      'JWT_SECRET must be at least 32 characters in production',
    ]);
    expect(errorsOf(prodEnv({ JWT_REFRESH_SECRET: 'a'.repeat(40) }))).toEqual([
      'JWT_SECRET and JWT_REFRESH_SECRET must differ',
    ]);
  });

  it('refuses plain-http origins in production', () => {
    expect(errorsOf(prodEnv({ ALLOWED_ORIGINS: 'http://lotto.example' }))[0]).toMatch(/must be https/);
  });

  it('reports a malformed origin or key as a schema error', () => {
    expect(errorsOf(prodEnv({ CHECKOUT_RETURN_ORIGINS: 'not a url' })).join()).toMatch(/not an origin/);
    expect(errorsOf(prodEnv({ ID_HASH_KEY: 'short' })).join()).toMatch(/ID_HASH_KEY: must be 32 bytes/);
  });

  it('accepts the old CORS_ORIGINS name when ALLOWED_ORIGINS is unset', () => {
    const r = loadConfig(prodEnv({ ALLOWED_ORIGINS: undefined, CORS_ORIGINS: 'https://old.example' }));
    expect(r.ok && r.config.ALLOWED_ORIGINS).toEqual(['https://old.example']);
  });

  it('a worker (RUN_API=false) does not need the browser-facing settings', () => {
    const r = loadConfig(
      prodEnv({ RUN_API: 'false', ALLOWED_ORIGINS: undefined, CHECKOUT_RETURN_ORIGINS: undefined, PUBLIC_API_URL: undefined }),
    );
    expect(r.ok).toBe(true);
    // ...but still needs the secrets the jobs use
    expect(errorsOf(prodEnv({ RUN_API: 'false', BUSINESS_NAME: undefined }))).toHaveLength(1);
  });
});

describe('loadConfig: development and test', () => {
  it('needs none of the production secrets and falls back to local origins', () => {
    const r = loadConfig({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://localhost/lotto',
      JWT_SECRET: 'x'.repeat(16),
      JWT_REFRESH_SECRET: 'y'.repeat(16),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.ALLOWED_ORIGINS).toContain('http://localhost:5173');
    expect(r.config.TRUST_PROXY_HOPS).toBe(0);
    expect(r.config.ENABLE_API_DOCS).toBe(true);
    expect(r.config.CHECKOUT_RETURN_ORIGINS).toEqual([]);
  });

  it('still rejects a missing DATABASE_URL or short JWT secret', () => {
    const errors = errorsOf({ NODE_ENV: 'test', JWT_SECRET: 'short', JWT_REFRESH_SECRET: 'y'.repeat(16) });
    expect(errors.join('\n')).toMatch(/DATABASE_URL/);
    expect(errors.join('\n')).toMatch(/JWT_SECRET/);
  });

  it('treats empty values as unset', () => {
    const r = loadConfig({
      DATABASE_URL: 'postgresql://x',
      JWT_SECRET: 'x'.repeat(16),
      JWT_REFRESH_SECRET: 'y'.repeat(16),
      SENTRY_DSN: '',
      ID_ENCRYPTION_KEY: '',
      TWILIO_ACCOUNT_SID: ' ',
    });
    expect(r.ok).toBe(true);
    expect(r.ok && r.config.SENTRY_DSN).toBeUndefined();
    expect(errorsOf(prodEnv({ REDIS_URL: '' }))).toEqual(['REDIS_URL is missing (OTP, rate limits and job locks)']);
  });

  it('parses RUN_API / RUN_JOBS flags', () => {
    const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(16), JWT_REFRESH_SECRET: 'y'.repeat(16) };
    const r = loadConfig({ ...base, RUN_JOBS: 'false', RUN_API: '1' });
    expect(r.ok && [r.config.RUN_API, r.config.RUN_JOBS]).toEqual([true, false]);
    expect(loadConfig({ ...base, RUN_JOBS: 'nope' }).ok).toBe(false);
  });
});
