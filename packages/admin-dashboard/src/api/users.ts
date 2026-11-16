import { api } from './client';
import type { AdminUser, AdminUserDetail, UserStatusChange } from './types';

/**
 * Exact or prefix match on the phone, at most 20, newest first. The backend normalises the input
 * (050-…, 972…, +972…) and needs at least 3 national digits, else 400 INVALID_PHONE_QUERY.
 */
export const searchUsers = (phone: string) => api.get<AdminUser[]>('/admin/users', { phone });
export const getUser = (id: string) => api.get<AdminUserDetail>(`/admin/users/${id}`);

const reasonBody = (reason?: string) => (reason?.trim() ? { reason: reason.trim() } : {});
/** The reason goes into the audit entry. */
export const suspendUser = (id: string, reason?: string) =>
  api.post<UserStatusChange>(`/admin/users/${id}/suspend`, reasonBody(reason));
export const unsuspendUser = (id: string, reason?: string) =>
  api.post<UserStatusChange>(`/admin/users/${id}/unsuspend`, reasonBody(reason));
