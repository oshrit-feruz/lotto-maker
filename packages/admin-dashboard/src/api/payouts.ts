import { api } from './client';
import { LIST_PAGE_SIZE } from './claims';
import type {
  CardCredit,
  CardCreditStatus,
  Page,
  Withdrawal,
  WithdrawalListItem,
  WithdrawalStatus,
  WithdrawalWithBank,
} from './types';

export const listWithdrawals = (status?: WithdrawalStatus, page = 1) =>
  api.get<Page<WithdrawalListItem>>('/admin/withdrawals', {
    status,
    page,
    pageSize: LIST_PAGE_SIZE,
  });
export const approveWithdrawal = (id: string) => api.post<Withdrawal>(`/admin/withdrawals/${id}/approve`);
/** `reason`: 2–500 characters. */
export const rejectWithdrawal = (id: string, reason: string) =>
  api.post<Withdrawal>(`/admin/withdrawals/${id}/reject`, { reason });
/** Bank withdrawals only, once approved: records the transfer's reference. The backend field is `bankReference`. */
export const markWithdrawalPaid = (id: string, reference: string) =>
  api.post<Withdrawal>(`/admin/withdrawals/${id}/mark-paid`, {
    bankReference: reference,
  });
/** The decrypted account details. Each call writes an audit entry, so call it only on an explicit click. */
export const getWithdrawalBankDetails = (id: string) =>
  api.get<WithdrawalWithBank>(`/admin/withdrawals/${id}/bank-details`);

export const listCardCredits = (status?: CardCreditStatus, page = 1) =>
  api.get<Page<CardCredit>>('/admin/card-credits', {
    status,
    page,
    pageSize: LIST_PAGE_SIZE,
  });
/**
 * The admin paid the credit outside the system; `reference` (1–100 chars) identifies that payment.
 * 409 CREDIT_IN_PROGRESS while the system is paying it to the card.
 */
export const markCardCreditPaid = (id: string, reference: string) =>
  api.post<{ id: string; status: 'paid' }>(`/admin/card-credits/${id}/mark-paid`, { reference });
