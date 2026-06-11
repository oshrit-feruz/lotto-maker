import ky from 'ky';

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
  prefixUrl: '/api',
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
          window.location.href = '/login';
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
    numbers: number[];
    strongNumber: number | null;
    type: string;
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

export async function uploadScan(slotId: string, file: File): Promise<{ scanUrl: string }> {
  const formData = new FormData();
  formData.append('image', file);
  return api.post(`operator/queue/${slotId}/scan`, { body: formData }).json();
}

export async function fetchShiftLog(date?: string): Promise<{ date: string; done: number; failed: number }> {
  const params = date ? `?date=${date}` : '';
  return api.get(`operator/shift-log${params}`).json();
}
