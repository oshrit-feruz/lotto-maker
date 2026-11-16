import type { Withdrawal, WithdrawalStatus } from '../api/types';

export const WITHDRAWAL_STATUSES: WithdrawalStatus[] = ['requested', 'approved', 'rejected', 'paid', 'failed', 'cancelled'];

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  requested: 'ממתינה לאישור',
  approved: 'אושרה',
  rejected: 'נדחתה',
  paid: 'שולמה',
  failed: 'נכשלה',
  cancelled: 'בוטלה',
};

export const WITHDRAWAL_STATUS_TONE: Record<WithdrawalStatus, 'gray' | 'green' | 'red' | 'amber' | 'blue'> = {
  requested: 'amber',
  approved: 'blue',
  rejected: 'red',
  paid: 'green',
  failed: 'red',
  cancelled: 'gray',
};

export const WITHDRAWAL_METHOD_LABEL: Record<Withdrawal['method'], string> = { card: 'כרטיס', bank: 'העברה בנקאית' };

/** Matches the backend's rules (withdrawals.service.ts). */
export const canApprove = (w: Pick<Withdrawal, 'status'>) => w.status === 'requested';
export const canReject = (w: Pick<Withdrawal, 'status' | 'method'>) =>
  w.status === 'requested' || (w.status === 'approved' && w.method === 'bank');
export const canMarkPaid = (w: Pick<Withdrawal, 'status' | 'method'>) => w.status === 'approved' && w.method === 'bank';

/** The backend's reject reason is 2–500 characters; a bank reference is 1–100. */
export const REJECT_REASON_MIN = 2;
export const REJECT_REASON_MAX = 500;
export const REFERENCE_MAX = 100;
