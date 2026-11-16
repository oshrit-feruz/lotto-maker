import { describe, expect, it } from 'vitest';
import { customerVerifyOtpBody } from './verify-otp-body';

const parsed = (raw: string) => JSON.parse(customerVerifyOtpBody(raw)!) as unknown;

describe('customerVerifyOtpBody', () => {
  it('adds the user audience', () => {
    expect(parsed('{"phone":"+972501234567","code":"123456"}')).toEqual({ phone: '+972501234567', code: '123456', audience: 'user' });
  });

  it.each(['admin', 'operator'])('overrides a browser asking for %s', (audience) => {
    expect(parsed(JSON.stringify({ phone: '+972501234567', code: '123456', audience, extra: 1 }))).toEqual({
      phone: '+972501234567',
      code: '123456',
      audience: 'user',
    });
  });

  it.each(['', 'not json', '[]', 'null', '"x"'])('rejects %j', (raw) => {
    expect(customerVerifyOtpBody(raw)).toBeNull();
  });
});
