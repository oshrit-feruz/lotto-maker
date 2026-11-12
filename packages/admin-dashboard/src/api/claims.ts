import { api } from './client';
import type { ClaimStatus, Page, PrizeClaim, PrizeClaimView } from './types';

/** Rows per page of the admin money lists (the backend allows up to 200). */
export const LIST_PAGE_SIZE = 50;

export const listClaims = (status?: ClaimStatus, page = 1) =>
  api.get<Page<PrizeClaim>>('/admin/prize-claims', {
    status,
    page,
    pageSize: LIST_PAGE_SIZE,
  });

/**
 * Hand-over against ID. `idLast4` is what the admin typed from the physical ID card; the backend
 * compares it with the claimant's (422 ID_MISMATCH otherwise) and returns the collected claim.
 */
export const collectClaim = (id: string, idLast4: string) =>
  api.post<PrizeClaimView>(`/admin/prize-claims/${id}/collect`, { idLast4 });

/** `scheduledFor` is an ISO date-time; it must be in the future and before the claim expires. */
export const scheduleClaim = (id: string, scheduledFor: string) =>
  api.post<PrizeClaimView>(`/admin/prize-claims/${id}/schedule`, {
    scheduledFor,
  });
