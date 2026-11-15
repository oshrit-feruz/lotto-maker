/** Where a user goes once the OTP is verified and /me is loaded. */
export type PostOtpStep = 'kyc' | 'home';

/**
 * A user who has not passed identity verification (`verifiedAdult` from /me)
 * goes through KYC, then the optional wallet load; a verified user goes home.
 */
export function postOtpStep(user: { verifiedAdult: boolean }): PostOtpStep {
  return user.verifiedAdult ? 'home' : 'kyc';
}
