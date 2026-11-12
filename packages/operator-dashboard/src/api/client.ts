import ky from 'ky';

// In production, VITE_API_URL is the full Railway URL.
// In development, we use the Vite proxy at /api → localhost:3000.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

let authToken = localStorage.getItem('operator_token') ?? '';

export function setToken(token: string) {
  authToken = token;
  localStorage.setItem('operator_token', token);
}

export function clearToken() {
  authToken = '';
  localStorage.removeItem('operator_token');
}

export const api = ky.create({
  prefixUrl: API_BASE || '/api',
  hooks: {
    beforeRequest: [
      (request) => {
        if (authToken) {
          request.headers.set('Authorization', `Bearer ${authToken}`);
        }
      },
    ],
    afterResponse: [
      async (_request, _options, response) => {
        if (response.status === 401) {
          clearToken();
          window.location.reload();
        }
      },
    ],
  },
  timeout: 10000,
});

export interface QueueSlotWithOrder {
  id: string;
  orderId: string;
  locationId: string;
  priority: number;
  deadline: string;
  status: string;
  retryCount: number;
  assignedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  order: {
    gameType: string;
    type: string;
    drawNumber: number | null;
    ticketType: 'regular' | 'double' | null;
    systematicType: string | null;
    /** True when the form must be keyed with Extra; the scan then needs the printed Extra digits. */
    extra: boolean;
    tables: Array<{ numbers: number[]; strongNumbers: number[] }>;
    /** Last 4 digits of the customer's ID number, for the prize form. Nothing else about the customer is sent. */
    idLast4: string | null;
  };
}

export async function fetchQueue(): Promise<{ slots: QueueSlotWithOrder[]; nextDeadline: string | null }> {
  return api.get('operator/queue').json();
}

export async function startSlot(slotId: string): Promise<QueueSlotWithOrder> {
  return api.post(`operator/queue/${slotId}/start`).json();
}

export async function doneSlot(slotId: string): Promise<QueueSlotWithOrder> {
  return api.post(`operator/queue/${slotId}/done`).json();
}

export async function uploadScan(slotId: string, file: File, extraDigits?: string): Promise<{ scanned: boolean }> {
  const formData = new FormData();
  // Text fields go before the file: the server reads them when it starts on the file
  if (extraDigits) formData.append('extraDigits', extraDigits);
  formData.append('image', file);
  return api.post(`operator/queue/${slotId}/scan`, { body: formData }).json();
}

export async function fetchShiftLog(date?: string): Promise<{ date: string; done: number; failed: number }> {
  const params = date ? `?date=${date}` : '';
  return api.get(`operator/shift-log${params}`).json();
}
