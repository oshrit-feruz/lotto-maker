import { request, revokeTokens, startSession, takeTokens, type TokenPair } from './client';

export interface Tokens extends TokenPair {
  isNewUser: boolean;
}

export const sendOtp = (phone: string) =>
  request<{ message: string; expiresIn: number }>('POST', '/auth/send-otp', { body: { phone }, auth: false });

/** Logs in; rejects with "המספר אינו מורשה כמנהל" (and keeps no tokens) for a non-admin phone. */
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const t = await request<Tokens>('POST', '/auth/verify-otp', { body: { phone, code }, auth: false });
  startSession(t);
}

/**
 * Ends the session locally at once (synchronously, before the returned promise settles), so
 * nothing in flight keeps using it, then revokes the refresh token server-side (best effort).
 */
export function logout(): Promise<void> {
  const t = takeTokens();
  return t ? revokeTokens(t) : Promise.resolve();
}
