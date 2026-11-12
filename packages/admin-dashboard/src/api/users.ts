import { api } from './client';
import type { AdminUser, AdminUserDetail } from './types';

// Contract only – none of these exist in the backend yet.
export const searchUsers = (phone: string) => api.get<AdminUser[]>('/admin/users', { phone });
export const getUser = (id: string) => api.get<AdminUserDetail>(`/admin/users/${id}`);
export const suspendUser = (id: string) => api.post<AdminUser>(`/admin/users/${id}/suspend`);
export const unsuspendUser = (id: string) => api.post<AdminUser>(`/admin/users/${id}/unsuspend`);
