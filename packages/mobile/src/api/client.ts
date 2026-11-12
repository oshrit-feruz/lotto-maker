import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

// expo-secure-store has no web implementation — fall back to localStorage
const isWeb = typeof localStorage !== 'undefined';

async function storageGet(key: string): Promise<string | null> {
  if (isWeb) return localStorage.getItem(key); // NOSONAR: expo-secure-store has no web impl; localStorage is the only persistent option
  return SecureStore.getItemAsync(key);
}

async function storageSet(key: string, value: string): Promise<void> {
  if (isWeb) { localStorage.setItem(key, value); return; } // NOSONAR: expo-secure-store has no web impl
  await SecureStore.setItemAsync(key, value);
}

async function storageRemove(key: string): Promise<void> {
  if (isWeb) { localStorage.removeItem(key); return; } // NOSONAR: expo-secure-store has no web impl
  await SecureStore.deleteItemAsync(key);
}

async function getToken(): Promise<string | null> {
  return storageGet('access_token');
}

export async function setToken(token: string): Promise<void> {
  await storageSet('access_token', token);
}

export async function setRefreshToken(token: string): Promise<void> {
  await storageSet('refresh_token', token);
}

export async function clearTokens(): Promise<void> {
  await storageRemove('access_token');
  await storageRemove('refresh_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'UNKNOWN' }));
    throw Object.assign(new Error(err.message ?? err.error), { statusCode: res.status, code: err.error });
  }

  return res.json() as Promise<T>;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export const authApi = {
  sendOtp: (phone: string) =>
    request<{ message: string }>('auth/send-otp', { method: 'POST', body: JSON.stringify({ phone }) }),

  verifyOtp: (phone: string, code: string) =>
    request<{ accessToken: string; refreshToken: string; isNewUser: boolean }>(
      'auth/verify-otp',
      { method: 'POST', body: JSON.stringify({ phone, code }) },
    ),
};

// ─── Users ──────────────────────────────────────────────────────────────────

export const usersApi = {
  getMe: () => request<{ id: string; phone: string; fullName: string | null; verifiedAdult: boolean; walletBalance: string }>('me'),

  updateMe: (data: { fullName?: string; fcmToken?: string }) =>
    request('me', { method: 'PUT', body: JSON.stringify(data) }),

  kyc: (params: { fullName: string; idNumber: string; dateOfBirth: string }) =>
    request<{ verifiedAdult: boolean }>('me/kyc', { method: 'POST', body: JSON.stringify(params) }),
};

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface TicketPayload {
  type: 'regular' | 'double';
  systematicType: string | null;
  extra: boolean;
  drawCount: number;
  tables: Array<{ numbers: number[]; strongNumbers: number[] }>;
}

export interface TicketPrice {
  combinations: number;
  drawCount: number;
  perOrder: { paisPrice: string; extraPrice: string; fee: string; total: string };
  total: string;
  draws: Array<{ drawNumber: number; drawAt: string; salesCloseAt: string; orderCutoff: string }>;
  enoughDraws: boolean;
}

export const ticketsApi = {
  // Price breakdown before payment: Pais price, our fee, total
  calculate: (ticket: TicketPayload) =>
    request<TicketPrice>('tickets/calculate', { method: 'POST', body: JSON.stringify(ticket) }),

  // A warning only: the user already has this combination in the same draw
  checkDuplicate: (ticket: TicketPayload) =>
    request<{ duplicate: boolean; drawNumbers: number[] }>(
      'tickets/check-duplicate', { method: 'POST', body: JSON.stringify(ticket) },
    ),

  // Lottomat: the server picks the numbers
  lottomat: (type: 'regular' | 'double', tableCount: number) =>
    request<{ tables: Array<{ numbers: number[]; strongNumbers: number[] }> }>(
      'tickets/lottomat', { method: 'POST', body: JSON.stringify({ type, tableCount }) },
    ),
};

export const ordersApi = {
  create: (params: { gameType?: string; ticket: TicketPayload; type: 'one_time' | 'subscription' }) =>
    request<{ orderId: string; ticketId: string; status: string; totalCharged: string; drawTime: string }>(
      'orders', { method: 'POST', body: JSON.stringify(params) },
    ),

  list: (params?: { status?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    return request<{ data: unknown[]; total: number }>(`orders?${qs}`);
  },

  get: (id: string) => request<Record<string, unknown>>(`orders/${id}`),

  // Signed URL for the ticket scan; valid for `expiresIn` seconds, so fetch it when needed.
  getScanUrl: (id: string) => request<{ url: string; expiresIn: number }>(`orders/${id}/scan`),
};

// ─── Wallet ──────────────────────────────────────────────────────────────────

export type PaymentStatus = 'pending' | 'approved' | 'failed' | 'refunded';

export const walletApi = {
  getBalance: () => request<{ balance: string }>('wallet/balance'),
  // Deposits go through the payment provider: the server returns a hosted
  // checkout URL and credits the wallet only after the provider confirms.
  createCheckout: (amount: number) =>
    request<{ paymentId: string; checkoutUrl: string }>(
      'payments/checkout', { method: 'POST', body: JSON.stringify({ amount }) },
    ),
  getPayment: (paymentId: string) =>
    request<{ paymentId: string; status: PaymentStatus; amount: string }>(`payments/${paymentId}`),
  getTransactions: (page?: number) => {
    const qs = page ? `?page=${page}` : '';
    return request<{ data: unknown[]; total: number }>(`wallet/transactions${qs}`);
  },
};

// ─── Subscriptions ─────────────────────────────────────────────────────────────────

export const subscriptionsApi = {
  create: (params: { gameType: string; numbers: number[]; strongNumber?: number; drawDays: string[] }) =>
    request('subscriptions', { method: 'POST', body: JSON.stringify(params) }),

  list: () => request<unknown[]>('subscriptions'),

  cancel: (id: string) => request(`subscriptions/${id}`, { method: 'DELETE' }),
};

// ─── Results & Draws ──────────────────────────────────────────────────────────────

export interface DrawResultResponse {
  drawNumber: number;
  gameType: string;
  winningNumbers: number[];
  strongNumber: number | null;
  drawDate: string;
}

export interface UpcomingDraw {
  gameType: string;
  drawNumber?: number;
  salesCloseAt?: string;
  drawTime: string;
  hardCutoff: string;
}

export const resultsApi = {
  getLatest: (gameType: string) =>
    request<DrawResultResponse>(`results/${gameType}/latest`),
  getByDate: (gameType: string, drawDate: string) =>
    request<DrawResultResponse>(`results/${gameType}/${drawDate}`),
};

export const drawsApi = {
  getUpcoming: () => request<UpcomingDraw[]>('draws/upcoming'),
};
