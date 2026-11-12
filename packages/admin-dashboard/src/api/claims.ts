import { api } from './client';
import type { ClaimStatus, PrizeClaim } from './types';

export const listClaims = (status?: ClaimStatus) => api.get<PrizeClaim[]>('/admin/prize-claims', { status });

/** Exists today without a body; `idLast4` is sent so the backend can verify it once it supports that. */
export const collectClaim = (id: string, idLast4: string) =>
  api.post<{ collected: boolean }>(`/admin/prize-claims/${id}/collected`, { idLast4 });

/** Contract only – not implemented in the backend yet. */
export const scheduleClaim = (id: string, scheduledFor: string) =>
  api.post<PrizeClaim>(`/admin/prize-claims/${id}/schedule`, { scheduledFor });
