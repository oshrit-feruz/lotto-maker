import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { toError } from '../api/client';
import type { CardCredit, Page } from '../api/types';
import CardCreditsPage, { CARD_CREDIT_STATUS_LABEL } from './CardCreditsPage';
import * as payouts from '../api/payouts';

vi.mock('../api/payouts', () => ({
  listCardCredits: vi.fn(),
  markCardCreditPaid: vi.fn(),
}));

const credit = (over: Partial<CardCredit> = {}): CardCredit => ({
  id: 'cc1',
  orderId: 'order-00000001',
  withdrawalId: null,
  userId: 'user-000000001',
  user: { phone: '+972501234567', fullName: 'ישראל ישראלי' },
  amount: '800.00',
  status: 'pending',
  attempts: 2,
  nextAttemptAt: '2026-11-12T10:00:00Z',
  claimedAt: null,
  lastError: 'NO_SAVED_CARD',
  providerTxId: null,
  paidAt: null,
  paidByAdminId: null,
  manualReference: null,
  createdAt: '2026-11-11T10:00:00Z',
  ...over,
});
const pageOf = (items: CardCredit[], over: Partial<Page<CardCredit>> = {}): Page<CardCredit> => ({
  items,
  total: items.length,
  page: 1,
  pageSize: 50,
  ...over,
});

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CardCreditsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(payouts.listCardCredits).mockReset();
  vi.mocked(payouts.markCardCreditPaid).mockReset();
});

describe('card credits page', () => {
  it('has a label for every status, including processing', () => {
    expect(Object.keys(CARD_CREDIT_STATUS_LABEL)).toEqual(['pending', 'processing', 'paid', 'failed']);
  });

  it('names the user, linking to their page, and shows where the money came from', async () => {
    vi.mocked(payouts.listCardCredits).mockResolvedValue(
      pageOf([credit(), credit({ id: 'cc2', orderId: null, withdrawalId: 'wd-00000009' })]),
    );
    renderPage();
    const links = await screen.findAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/users/user-000000001');
    expect(within(links[0]!).getByText('+972501234567')).toBeInTheDocument();
    expect(screen.getAllByText('ישראל ישראלי')).toHaveLength(2);
    expect(screen.getByText('זכייה 00000001')).toBeInTheDocument();
    expect(screen.getByText('משיכה 00000009')).toBeInTheDocument();
    expect(payouts.listCardCredits).toHaveBeenCalledWith('pending', 1);
  });

  it('offers no mark-paid while the system is paying the credit', async () => {
    vi.mocked(payouts.listCardCredits).mockResolvedValue(
      pageOf([credit({ status: 'processing', claimedAt: '2026-11-12T10:00:00Z' })]),
    );
    renderPage();
    expect(await screen.findByText('בזיכוי כעת')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'סמן כשולם' })).toBeNull();
  });

  it('shows the Hebrew message when the payout started meanwhile (409 CREDIT_IN_PROGRESS)', async () => {
    vi.mocked(payouts.listCardCredits).mockResolvedValue(pageOf([credit()]));
    vi.mocked(payouts.markCardCreditPaid).mockRejectedValueOnce(
      toError({ status: 409 }, { error: 'CREDIT_IN_PROGRESS', message: 'english' }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'סמן כשולם' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('אסמכתת התשלום (למשל מספר העברה בנקאית)'), 'TX-1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'סמן כשולם' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('המערכת מבצעת כעת את הזיכוי לכרטיס');
    expect(payouts.markCardCreditPaid).toHaveBeenCalledWith('cc1', 'TX-1');
  });

  it('pages with next and previous', async () => {
    vi.mocked(payouts.listCardCredits).mockImplementation(async (_s, page = 1) =>
      pageOf([credit({ id: `cc${page}`, amount: `${page}0.00` })], {
        total: 51,
        page,
      }),
    );
    renderPage();
    await screen.findByText('₪10.00');
    await userEvent.click(screen.getByRole('button', { name: 'הבא' }));
    await screen.findByText('₪20.00');
    expect(payouts.listCardCredits).toHaveBeenLastCalledWith('pending', 2);
    await userEvent.click(screen.getByRole('button', { name: 'הקודם' }));
    await screen.findByText('₪10.00');
  });
});
