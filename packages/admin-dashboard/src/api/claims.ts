import { api } from './client';
import type { ClaimStatus, PrizeClaim, PrizeClaimView } from './types';

export const listClaims = (status?: ClaimStatus) => api.get<PrizeClaim[]>('/admin/prize-claims', { status });

/**
 * Hand-over against ID. `idLast4` is what the admin typed from the physical ID card; the backend
 * compares it with the claimant's (422 ID_MISMATCH otherwise) and returns the collected claim.
 */
export const collectClaim = (id: string, idLast4: string) =>
  api.post<PrizeClaimView>(`/admin/prize-claims/${id}/collect`, { idLast4 });

/** `scheduledFor` is an ISO date-time; it must be in the future and before the claim expires. */
export const scheduleClaim = (id: string, scheduledFor: string) =>
  api.post<PrizeClaimView>(`/admin/prize-claims/${id}/schedule`, { scheduledFor });
