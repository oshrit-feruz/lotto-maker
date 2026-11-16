/**
 * The body the site forwards to the backend's POST /auth/verify-otp. Only phone and code are taken
 * from the browser; the audience is always 'user', so the public site can never be used to obtain
 * an admin or operator token, whatever the request asks for. Null when the body is not a JSON object.
 */
export function customerVerifyOtpBody(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const { phone, code } = parsed as { phone?: unknown; code?: unknown };
  return JSON.stringify({ phone, code, audience: 'user' });
}
