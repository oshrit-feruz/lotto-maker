import { api } from './client';
import type { CardCredit, CardCreditStatus, Withdrawal, WithdrawalStatus } from './types';

// Phase 3 contract (backend lands in #14).
export const listWithdrawals = (status?: WithdrawalStatus) => api.get<Withdrawal[]>('/admin/withdrawals', { status });
export const approveWithdrawal = (id: string) => api.post<Withdrawal>(`/admin/withdrawals/${id}/approve`);
export const rejectWithdrawal = (id: string, reason: string) =>
  api.post<Withdrawal>(`/admin/withdrawals/${id}/reject`, { reason });
export const markWithdrawalPaid = (id: string, reference: string) =>
  api.post<Withdrawal>(`/admin/withdrawals/${id}/mark-paid`, { reference });

export const listCardCredits = (status?: CardCreditStatus) => api.get<CardCredit[]>('/admin/card-credits', { status });
export const markCardCreditPaid = (id: string) => api.post<CardCredit>(`/admin/card-credits/${id}/mark-paid`);
