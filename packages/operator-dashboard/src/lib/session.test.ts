import { describe, expect, it } from 'vitest';
import { endsSession } from './session.js';

const req = (path: string, token = true) =>
  new Request(`https://api.example.com${path}`, { method: 'POST', headers: token ? { Authorization: 'Bearer t' } : {} });
const res = (status: number) => new Response(null, { status });

describe('endsSession', () => {
  it('ends the session on a 401 to an authenticated request', () => {
    expect(endsSession(req('/operator/queue'), res(401))).toBe(true);
    expect(endsSession(req('/api/operator/queue/1/start'), res(401))).toBe(true);
  });

  it.each(['/auth/verify-otp', '/auth/send-otp', '/auth/refresh', '/api/auth/verify-otp'])('keeps the login page on a 401 from %s', (path) => {
    expect(endsSession(req(path), res(401))).toBe(false);
  });

  it('ignores a 401 to a request without a token', () => {
    expect(endsSession(req('/operator/queue', false), res(401))).toBe(false);
  });

  it.each([200, 403, 410, 429, 500])('ignores status %i', (status) => {
    expect(endsSession(req('/operator/queue'), res(status))).toBe(false);
  });
});
