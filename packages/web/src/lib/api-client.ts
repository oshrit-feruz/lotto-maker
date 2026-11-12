// Browser-side calls. Everything goes through our own route handlers, which
// hold the tokens in httpOnly cookies (see lib/session.ts).

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  OTP_RATE_LIMITED: 'יותר מדי בקשות קוד. נסו שוב מאוחר יותר.',
  RATE_LIMITED: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.',
  OTP_INVALID: 'הקוד שגוי.',
  OTP_EXPIRED: 'פג תוקף הקוד. שלחו קוד חדש.',
  ID_NUMBER_ALREADY_USED: 'מספר תעודת הזהות כבר רשום בחשבון אחר.',
  INVALID_ID_NUMBER: 'מספר תעודת הזהות אינו תקין.',
  INVALID_DATE_OF_BIRTH: 'תאריך הלידה אינו תקין.',
  AGE_VERIFICATION_FAILED: 'השירות מיועד לבני 18 ומעלה בלבד.',
  AGE_VERIFICATION_REQUIRED: 'יש להשלים את פרטי הפרופיל לפני הזמנה.',
  ACCOUNT_SUSPENDED: 'החשבון מושעה. פנו לשירות הלקוחות.',
  INSUFFICIENT_BALANCE: 'אין מספיק יתרה בארנק.',
  CUTOFF_PASSED: 'ההזמנות להגרלה הקרובה נסגרו.',
  NOT_ENOUGH_DRAWS: 'עדיין לא פורסמו מספיק הגרלות עבור מספר ההגרלות שבחרתם.',
  INVALID_TICKET: 'הטופס אינו תקין.',
  GAME_NOT_AVAILABLE: 'המשחק אינו זמין כרגע.',
  NO_ACTIVE_LOCATIONS: 'השירות אינו זמין כרגע. נסו שוב מאוחר יותר.',
  WALLET_CAP_EXCEEDED: 'הטעינה תחרוג מתקרת הארנק.',
  WITHDRAWAL_NOT_CANCELLABLE: 'לא ניתן לבטל את המשיכה בשלב זה.',
  UNAUTHORIZED: 'יש להתחבר מחדש.',
  BACKEND_UNAVAILABLE: 'השרת אינו זמין כרגע. נסו שוב בעוד רגע.',
  NOT_FOUND: 'הפעולה אינה זמינה.',
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return MESSAGES[err.code] ?? (err.status >= 500 ? 'אירעה שגיאה. נסו שוב.' : err.message);
  return 'אירעה שגיאה. נסו שוב.';
}

async function request<T>(url: string, method: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { accept: 'application/json', ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, 'BACKEND_UNAVAILABLE', 'network error');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string; details?: unknown };
    throw new ApiError(res.status, d.error ?? `HTTP_${res.status}`, d.message ?? res.statusText, d.details);
  }
  return data as T;
}

/** Calls a backend route through /api/proxy. `path` has no leading slash, e.g. "orders?page=1". */
export const api = {
  get: <T>(path: string) => request<T>(`/api/proxy/${path}`, 'GET'),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(`/api/proxy/${path}`, 'POST', body ?? {}, headers),
  put: <T>(path: string, body: unknown) => request<T>(`/api/proxy/${path}`, 'PUT', body),
  del: <T>(path: string) => request<T>(`/api/proxy/${path}`, 'DELETE'),
};

export const auth = {
  sendOtp: (phone: string) => request<{ message: string; expiresIn: number }>('/api/auth/send-otp', 'POST', { phone }),
  verifyOtp: (phone: string, code: string) =>
    request<{ isNewUser: boolean }>('/api/auth/verify-otp', 'POST', { phone, code }),
  logout: () => request<{ ok: true }>('/api/auth/logout', 'POST', {}),
};

/** Only same-site relative paths are accepted as a post-login destination. */
export function safeNextPath(next: string | null | undefined, fallback = '/account'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
