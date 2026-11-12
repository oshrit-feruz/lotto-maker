import { api } from './client';
import type { ClaimStatus, PrizeClaim } from './types';

export const listClaims = (status?: ClaimStatus) => api.get<PrizeClaim[]>('/admin/prize-claims', { status });

/** The backend re-checks `idLast4` against the claimant before marking the claim collected. */
export const collectClaim = (id: string, idLast4: string) =>
  api.post<{ collected: boolean }>(`/admin/prize-claims/${id}/collect`, { idLast4 });

/** Contract only – not implemented in the backend yet. */
export const scheduleClaim = (id: string, scheduledFor: string) =>
  api.post<PrizeClaim>(`/admin/prize-claims/${id}/schedule`, { scheduledFor });
