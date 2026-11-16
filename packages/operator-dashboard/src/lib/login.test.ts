import { describe, expect, it } from 'vitest';
import { DEFAULT_VERIFY_ERROR, verifyErrorMessage, verifyOtpBody } from './login.js';

const httpError = (status: number, body: string) => ({ response: new Response(body, { status }) });

describe('operator login', () => {
  it('asks for an operator token', () => {
    expect(verifyOtpBody('+972501234567', '123456')).toEqual({ phone: '+972501234567', code: '123456', audience: 'operator' });
  });

  it.each([
    [httpError(403, JSON.stringify({ error: 'NOT_AN_OPERATOR' })), 'המספר הזה לא רשום כמפעיל'],
    [httpError(410, JSON.stringify({ error: 'OTP_EXPIRED' })), 'תוקף הקוד פג. שלח קוד חדש.'],
    [httpError(401, JSON.stringify({ error: 'OTP_INVALID' })), DEFAULT_VERIFY_ERROR],
    [httpError(400, JSON.stringify({ error: 'toString' })), DEFAULT_VERIFY_ERROR],
    [httpError(502, 'Bad Gateway'), DEFAULT_VERIFY_ERROR],
    [new Error('network'), DEFAULT_VERIFY_ERROR],
    [null, DEFAULT_VERIFY_ERROR],
  ])('maps %o to Hebrew', async (err, text) => {
    expect(await verifyErrorMessage(err)).toBe(text);
  });
});
