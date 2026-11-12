import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Withdrawal, WithdrawalStatus } from '../api/types';
import { canApprove, canMarkPaid, canReject, WITHDRAWAL_STATUSES, WITHDRAWAL_STATUS_LABEL } from '../lib/withdrawals';
import WithdrawalsPage from './WithdrawalsPage';
import * as payouts from '../api/payouts';

vi.mock('../api/payouts', () => ({
  listWithdrawals: vi.fn(),
  approveWithdrawal: vi.fn(),
  rejectWithdrawal: vi.fn(),
  markWithdrawalPaid: vi.fn(),
  getWithdrawalBankDetails: vi.fn(),
  listCardCredits: vi.fn(),
  markCardCreditPaid: vi.fn(),
}));

const w = (over: Partial<Withdrawal> = {}): Withdrawal => ({
  id: 'w1',
  userId: 'user-000000001',
  amount: '500.00',
  fee: '5.00',
  payout: '495.00',
  method: 'bank',
  status: 'requested',
  savedCardId: null,
  bankAccountLast4: '6789',
  failureReason: null,
  decidedAt: null,
  paidAt: null,
  createdAt: '2026-11-11T10:00:00Z',
  adminId: null,
  bankReference: null,
  providerTxId: null,
  ...over,
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <WithdrawalsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('withdrawal status labels', () => {
  it('has a Hebrew label for every backend status and none for "pending"', () => {
    expect(WITHDRAWAL_STATUSES).toEqual(['requested', 'approved', 'rejected', 'paid', 'failed', 'cancelled']);
    expect(WITHDRAWAL_STATUS_LABEL).toEqual({
      requested: 'ממתינה לאישור',
      approved: 'אושרה',
      rejected: 'נדחתה',
      paid: 'שולמה',
      failed: 'נכשלה',
      cancelled: 'בוטלה',
    });
    expect('pending' in WITHDRAWAL_STATUS_LABEL).toBe(false);
  });

  it('allows the actions the backend allows', () => {
    const s = (status: WithdrawalStatus, method: 'bank' | 'card' = 'bank') => ({ status, method });
    expect(canApprove(s('requested'))).toBe(true);
    expect(canApprove(s('approved'))).toBe(false);
    expect(canReject(s('requested', 'card'))).toBe(true);
    expect(canReject(s('approved', 'bank'))).toBe(true);
    expect(canReject(s('approved', 'card'))).toBe(false);
    expect(canMarkPaid(s('approved', 'bank'))).toBe(true);
    expect(canMarkPaid(s('approved', 'card'))).toBe(false);
    expect(canMarkPaid(s('requested', 'bank'))).toBe(false);
  });

  it('filters by "requested" by default and lists every status in the filter', async () => {
    vi.mocked(payouts.listWithdrawals).mockReset().mockResolvedValue([w()]);
    renderPage();
    expect(await screen.findByText('₪495.00')).toBeInTheDocument();
    expect(payouts.listWithdrawals).toHaveBeenCalledWith('requested');
    const options = within(screen.getByLabelText('סטטוס')).getAllByRole('option');
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(WITHDRAWAL_STATUSES);
    const row = screen.getAllByRole('row')[1]!;
    expect(within(row).getByText('ממתינה לאישור')).toBeInTheDocument();
  });
});

describe('withdrawal actions', () => {
  beforeEach(() => {
    vi.mocked(payouts.listWithdrawals).mockReset();
    vi.mocked(payouts.getWithdrawalBankDetails).mockReset();
    vi.mocked(payouts.markWithdrawalPaid).mockReset();
    vi.mocked(payouts.rejectWithdrawal).mockReset();
  });

  it('fetches bank details only on an explicit click, then marks paid with the reference', async () => {
    const approved = w({ status: 'approved' });
    vi.mocked(payouts.listWithdrawals).mockResolvedValue([approved]);
    vi.mocked(payouts.getWithdrawalBankDetails).mockResolvedValueOnce({
      ...approved,
      bank: { holderName: 'ישראל ישראלי', bankCode: '12', branchCode: '345', accountNumber: '123456789' },
    });
    vi.mocked(payouts.markWithdrawalPaid).mockResolvedValueOnce({ ...approved, status: 'paid', bankReference: 'TX-1' });
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'סמן כשולמה' }));
    const dialog = screen.getByRole('dialog');
    expect(payouts.getWithdrawalBankDetails).not.toHaveBeenCalled();
    expect(within(dialog).queryByText('123456789')).toBeNull();

    await userEvent.click(within(dialog).getByRole('button', { name: 'הצג פרטי בנק' }));
    expect(await within(dialog).findByText('123456789')).toBeInTheDocument();
    expect(payouts.getWithdrawalBankDetails).toHaveBeenCalledTimes(1);
    expect(payouts.getWithdrawalBankDetails).toHaveBeenCalledWith('w1');

    const confirm = within(dialog).getByRole('button', { name: 'סימון כשולמה' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('אסמכתת ההעברה הבנקאית'), ' TX-1 ');
    await userEvent.click(confirm);
    expect(payouts.markWithdrawalPaid).toHaveBeenCalledWith('w1', 'TX-1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('requires a reject reason of at least 2 characters', async () => {
    vi.mocked(payouts.listWithdrawals).mockResolvedValue([w({ method: 'card', bankAccountLast4: null })]);
    vi.mocked(payouts.rejectWithdrawal).mockResolvedValueOnce(w({ status: 'rejected' }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'דחה' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'הצג פרטי בנק' })).toBeNull();
    const confirm = within(dialog).getByRole('button', { name: 'דחיית משיכה' });
    await userEvent.type(within(dialog).getByLabelText('סיבת הדחייה'), 'x');
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('סיבת הדחייה'), 'y');
    await userEvent.click(confirm);
    expect(payouts.rejectWithdrawal).toHaveBeenCalledWith('w1', 'xy');
  });
});
