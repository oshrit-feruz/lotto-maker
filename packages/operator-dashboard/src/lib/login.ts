/**
 * The operator login sends `audience: 'operator'`, so the backend issues an operator token even
 * when the phone is also a customer or an admin, and answers 403 NOT_AN_OPERATOR when the phone
 * has no active operator.
 */
export const verifyOtpBody = (phone: string, code: string) => ({ phone, code, audience: 'operator' as const });

export const DEFAULT_VERIFY_ERROR = 'קוד שגוי. נסה שנית.';
export const DEFAULT_SEND_ERROR = 'שגיאה בשליחת קוד. בדוק את מספר הטלפון.';
export const RATE_LIMITED_ERROR = 'יותר מדי ניסיונות. נסה שוב מאוחר יותר.';

/** Backend error codes (packages/backend/src/modules/auth, plugins/rate-limit.ts) to Hebrew. */
const LOGIN_ERRORS: Record<string, string> = {
  OTP_INVALID: DEFAULT_VERIFY_ERROR,
  NOT_AN_OPERATOR: 'המספר הזה לא רשום כמפעיל',
  OTP_EXPIRED: 'תוקף הקוד פג. שלח קוד חדש.',
  RATE_LIMITED: RATE_LIMITED_ERROR,
  OTP_RATE_LIMITED: RATE_LIMITED_ERROR,
};

/** The Hebrew text for a failed login call (a ky HTTPError carries the `response`). */
async function loginErrorMessage(err: unknown, fallback: string): Promise<string> {
  const res = (err as { response?: unknown } | null)?.response;
  if (!(res instanceof Response)) return fallback;
  try {
    const { error } = (await res.clone().json()) as { error?: unknown };
    if (typeof error === 'string' && Object.hasOwn(LOGIN_ERRORS, error)) return LOGIN_ERRORS[error]!;
  } catch {
    // Not JSON (e.g. a proxy error page): fall back on the status below
  }
  return res.status === 429 ? RATE_LIMITED_ERROR : fallback;
}

/** The Hebrew text for a failed verify-otp call. */
export const verifyErrorMessage = (err: unknown) => loginErrorMessage(err, DEFAULT_VERIFY_ERROR);

/** The Hebrew text for a failed send-otp call. */
export const sendErrorMessage = (err: unknown) => loginErrorMessage(err, DEFAULT_SEND_ERROR);
