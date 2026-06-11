import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('access_token');
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('access_token', token);
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('refresh_token', token);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
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

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  sendOtp: (phone: string) =>
    request<{ message: string }>('auth/send-otp', { method: 'POST', body: JSON.stringify({ phone }) }),

  verifyOtp: (phone: string, code: string) =>
    request<{ accessToken: string; refreshToken: string; isNewUser: boolean }>(
      'auth/verify-otp',
      { method: 'POST', body: JSON.stringify({ phone, code }) },
    ),
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const usersApi = {
  getMe: () => request<{ id: string; phone: string; fullName: string | null; verifiedAdult: boolean; walletBalance: string }>('me'),

  updateMe: (data: { fullName?: string; fcmToken?: string }) =>
    request('me', { method: 'PUT', body: JSON.stringify(data) }),

  kyc: (params: { fullName: string; idNumber: string; dateOfBirth: string }) =>
    request<{ verifiedAdult: boolean }>('me/kyc', { method: 'POST', body: JSON.stringify(params) }),
};

// ─── Orders ──────────────────────────────────────────────────────────────────

export const ordersApi = {
  create: (params: {
    gameType: string;
    numbers: number[];
    strongNumber?: number;
    type: 'one_time' | 'subscription';
  }) => request<{ orderId: string; status: string; totalCharged: string; drawTime: string }>(
    'orders', { method: 'POST', body: JSON.stringify(params) }
  ),

  list: (params?: { status?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    return request<{ data: unknown[]; total: number }>(`orders?${qs}`);
  },

  get: (id: string) => request<Record<string, unknown>>(`orders/${id}`),
};

// ─── Wallet ──────────────────────────────────────────────────────────────────

export const walletApi = {
  getBalance: () => request<{ balance: string }>('wallet/balance'),
  deposit: (amount: number) => request('wallet/deposit', { method: 'POST', body: JSON.stringify({ amount }) }),
  getTransactions: (page?: number) => {
    const qs = page ? `?page=${page}` : '';
    return request<{ data: unknown[]; total: number }>(`wallet/transactions${qs}`);
  },
};

// ─── Subscriptions ───────────────────────────────────────────────────────────

export const subscriptionsApi = {
  create: (params: { gameType: string; numbers: number[]; strongNumber?: number; drawDays: string[] }) =>
    request('subscriptions', { method: 'POST', body: JSON.stringify(params) }),

  list: () => request<unknown[]>('subscriptions'),

  cancel: (id: string) => request(`subscriptions/${id}`, { method: 'DELETE' }),
};
