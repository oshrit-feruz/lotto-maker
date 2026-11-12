import { request, storeTokens, clearTokens, getStoredRefreshToken } from './client';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  isNewUser: boolean;
}

export const sendOtp = (phone: string) =>
  request<{ message: string; expiresIn: number }>('POST', '/auth/send-otp', { body: { phone }, auth: false });

export async function verifyOtp(phone: string, code: string): Promise<void> {
  const t = await request<Tokens>('POST', '/auth/verify-otp', { body: { phone, code }, auth: false });
  storeTokens(t);
}

export async function logout(): Promise<void> {
  const rt = getStoredRefreshToken();
  try {
    if (rt) await request('DELETE', '/auth/logout', { body: { refreshToken: rt } });
  } catch {
    /* best effort */
  } finally {
    clearTokens();
  }
}
