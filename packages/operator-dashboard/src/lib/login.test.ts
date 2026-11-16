import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEND_ERROR,
  DEFAULT_VERIFY_ERROR,
  RATE_LIMITED_ERROR,
  sendErrorMessage,
  verifyErrorMessage,
  verifyOtpBody,
} from './login.js';

const httpError = (status: number, body: string) => ({ response: new Response(body, { status }) });
const jsonError = (status: number, error: string) => httpError(status, JSON.stringify({ error }));

describe('operator login', () => {
  it('asks for an operator token', () => {
    expect(verifyOtpBody('+972501234567', '123456')).toEqual({ phone: '+972501234567', code: '123456', audience: 'operator' });
  });

  it.each([
    [jsonError(401, 'OTP_INVALID'), 'קוד שגוי. נסה שנית.'],
    [jsonError(403, 'NOT_AN_OPERATOR'), 'המספר הזה לא רשום כמפעיל'],
    [jsonError(410, 'OTP_EXPIRED'), 'תוקף הקוד פג. שלח קוד חדש.'],
    [jsonError(429, 'RATE_LIMITED'), RATE_LIMITED_ERROR],
    [httpError(429, 'Too Many Requests'), RATE_LIMITED_ERROR],
    [jsonError(400, 'toString'), DEFAULT_VERIFY_ERROR],
    [httpError(502, 'Bad Gateway'), DEFAULT_VERIFY_ERROR],
    [new Error('network'), DEFAULT_VERIFY_ERROR],
    [null, DEFAULT_VERIFY_ERROR],
  ])('maps a verify error %o to Hebrew', async (err, text) => {
    expect(await verifyErrorMessage(err)).toBe(text);
  });

  it.each([
    [jsonError(429, 'OTP_RATE_LIMITED'), RATE_LIMITED_ERROR],
    [jsonError(429, 'RATE_LIMITED'), RATE_LIMITED_ERROR],
    [jsonError(400, 'VALIDATION_ERROR'), DEFAULT_SEND_ERROR],
    [new Error('network'), DEFAULT_SEND_ERROR],
  ])('maps a send error %o to Hebrew', async (err, text) => {
    expect(await sendErrorMessage(err)).toBe(text);
  });
});
