import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { pino } from 'pino';
import { redactDeep, redactString, isSensitiveKey, REDACTED } from '../../src/lib/redact.js';
import { buildLoggerOptions, genReqId } from '../../src/lib/logger.js';
import type { IncomingMessage } from 'node:http';

describe('redactDeep', () => {
  it('masks auth headers, cookies, ID numbers, card tokens and OTP codes at any depth', () => {
    const out = redactDeep({
      headers: { authorization: 'Bearer eyJhbGciOi.xxx.yyy', cookie: 'sid=abc', 'user-agent': 'curl' },
      body: { phone: '+972501234567', otp: '123456', otpCode: '654321' },
      user: { kyc: { idNumber: '123456782', id_number_enc: 'v1:abc', idNumberHash: 'ff00' } },
      payment: { cardToken: 'tok_live_1', providerToken: 'p', last4: '4242' },
      tokens: [{ refreshToken: 'r1' }, { accessToken: 'a1' }],
    }) as Record<string, any>;

    expect(out.headers.authorization).toBe(REDACTED);
    expect(out.headers.cookie).toBe(REDACTED);
    expect(out.headers['user-agent']).toBe('curl');
    expect(out.body).toEqual({ phone: '+972501234567', otp: REDACTED, otpCode: REDACTED });
    expect(out.user.kyc).toEqual({ idNumber: REDACTED, id_number_enc: REDACTED, idNumberHash: REDACTED });
    expect(out.payment).toEqual({ cardToken: REDACTED, providerToken: REDACTED, last4: '4242' });
    expect(out.tokens).toEqual([{ refreshToken: REDACTED }, { accessToken: REDACTED }]);
  });

  it('keeps error codes (the bare key `code` is not treated as an OTP)', () => {
    expect(redactDeep({ code: 'P2002', error: 'INSUFFICIENT_BALANCE' })).toEqual({ code: 'P2002', error: 'INSUFFICIENT_BALANCE' });
  });

  it('scrubs Errors (message and stack) and keeps their name', () => {
    const err = Object.assign(new Error('KYC failed for 123456782'), { cardToken: 'tok_1', status: 400 });
    const out = redactDeep(err) as Record<string, unknown>;
    expect(out.type).toBe('Error');
    expect(out.message).toBe(`KYC failed for ${REDACTED}`);
    expect(String(out.stack)).not.toContain('123456782');
    expect(out.cardToken).toBe(REDACTED);
    expect(out.status).toBe(400);
  });

  it('survives cycles and does not touch the input', () => {
    const a: Record<string, unknown> = { token: 't' };
    a.self = a;
    const out = redactDeep(a) as Record<string, unknown>;
    expect(out).toEqual({ token: REDACTED, self: '[Circular]' });
    expect(a.token).toBe('t');
  });
});

describe('redactString', () => {
  it('masks bearer tokens, token / code query params and 9-digit ID numbers', () => {
    expect(redactString('Authorization: Bearer abc.def.ghi')).toBe(`Authorization: Bearer ${REDACTED}`);
    expect(redactString('/operator/queue/stream?token=eyJ.x.y&x=1')).toBe(`/operator/queue/stream?token=${REDACTED}&x=1`);
    expect(redactString('GET /cb?code=123456')).toBe(`GET /cb?code=${REDACTED}`);
    expect(redactString('id 012345678 rejected')).toBe(`id ${REDACTED} rejected`);
  });

  it('leaves phone numbers, amounts, order numbers and cuids alone', () => {
    const s = 'phone +972501234567 paid 2600.00 order 2026-000123 user clx0123456789ab';
    expect(redactString(s)).toBe(s);
  });

  it('matches sensitive keys case- and separator-insensitively', () => {
    expect(isSensitiveKey('ID-NUMBER')).toBe(true);
    expect(isSensitiveKey('Set-Cookie')).toBe(true);
    expect(isSensitiveKey('card_token')).toBe(true);
    expect(isSensitiveKey('amount')).toBe(false);
  });
});

describe('logger', () => {
  function capture() {
    const lines: Record<string, any>[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(JSON.parse(chunk.toString()));
        cb();
      },
    });
    return { log: pino(buildLoggerOptions('info'), stream), lines };
  }

  it('redacts whatever is logged through it, including errors', () => {
    const { log, lines } = capture();
    log.info({ body: { idNumber: '123456782', cardToken: 'tok' } }, 'kyc for 123456782');
    log.error({ err: Object.assign(new Error('bad token Bearer abc'), { code: 'E1' }) }, 'failed');

    expect(lines[0]!.body).toEqual({ idNumber: REDACTED, cardToken: REDACTED });
    expect(lines[0]!.msg).toBe('kyc for 123456782'.replace('123456782', REDACTED));
    expect(lines[1]!.err.type).toBe('Error');
    expect(lines[1]!.err.message).toBe(`bad token Bearer ${REDACTED}`);
    expect(lines[1]!.err.code).toBe('E1');
    expect(JSON.stringify(lines)).not.toContain('123456782');
  });

  it('serializes requests without headers and with the query token masked', () => {
    const { log, lines } = capture();
    log.info({
      req: { id: 'r1', method: 'GET', url: '/operator/queue/stream?token=eyJ.a.b', headers: { authorization: 'Bearer x', 'user-agent': 'ua' }, ip: '1.2.3.4' },
    });
    expect(lines[0]!.req).toEqual({ id: 'r1', method: 'GET', url: `/operator/queue/stream?token=${REDACTED}`, ip: '1.2.3.4', userAgent: 'ua' });
  });

  it('genReqId keeps a sane incoming X-Request-Id and replaces anything else', () => {
    const req = (v?: string) => ({ headers: v === undefined ? {} : { 'x-request-id': v } }) as unknown as IncomingMessage;
    expect(genReqId(req('abc-123'))).toBe('abc-123');
    expect(genReqId(req('x'.repeat(65)))).toMatch(/^[0-9a-f-]{36}$/);
    expect(genReqId(req('bad id\n'))).toMatch(/^[0-9a-f-]{36}$/);
    expect(genReqId(req())).toMatch(/^[0-9a-f-]{36}$/);
  });
});
