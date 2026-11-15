import { describe, it, expect } from 'vitest';
import { postOtpStep } from './onboarding.js';

describe('postOtpStep', () => {
  it('sends an unverified user to KYC', () => {
    expect(postOtpStep({ verifiedAdult: false })).toBe('kyc');
  });

  it('sends a verified user straight home', () => {
    expect(postOtpStep({ verifiedAdult: true })).toBe('home');
  });
});
