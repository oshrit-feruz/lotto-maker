import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AdminUserDetail } from '../api/types';
import { nationalDigits } from '../lib/phone';
import UsersPage from './UsersPage';
import { UserView } from './UserDetailPage';
import { actorLabel } from './AuditPage';
import * as users from '../api/users';

vi.mock('../api/users', () => ({ searchUsers: vi.fn(), getUser: vi.fn(), suspendUser: vi.fn(), unsuspendUser: vi.fn() }));

const user: AdminUserDetail = {
  id: 'u1',
  phone: '+972501234567',
  fullName: 'ישראל ישראלי',
  walletBalance: '12.50',
  balance: '12.50',
  status: 'active',
  verifiedAdult: true,
  idLast4: '1234',
  createdAt: '2026-01-01T10:00:00Z',
  orders: [{ id: 'o1', status: 'won', total: '30.00', drawNumber: 3900, createdAt: '2026-11-01T10:00:00Z' }],
  walletTransactions: [{ id: 't1', type: 'winning', amount: '100.00', description: 'זכייה', createdAt: '2026-11-02T10:00:00Z' }],
};

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe('user search', () => {
  beforeEach(() => vi.mocked(users.searchUsers).mockReset().mockResolvedValue([user]));

  it('counts national digits like the backend', () => {
    expect(nationalDigits('050-1')).toBe('501');
    expect(nationalDigits('+97250')).toBe('50');
    expect(nationalDigits('0')).toBe('');
  });

  it('shows a Hebrew hint and does not search with fewer than 3 digits', async () => {
    wrap(<UsersPage />);
    await userEvent.type(screen.getByLabelText(/חיפוש לפי טלפון/), '05');
    await userEvent.click(screen.getByRole('button', { name: 'חפש' }));
    expect(screen.getByRole('alert')).toHaveTextContent('לפחות 3 ספרות');
    expect(users.searchUsers).not.toHaveBeenCalled();
  });

  it('sends what was typed; the backend normalises it', async () => {
    wrap(<UsersPage />);
    await userEvent.type(screen.getByLabelText(/חיפוש לפי טלפון/), '050-123');
    await userEvent.click(screen.getByRole('button', { name: 'חפש' }));
    expect(await screen.findByText('ישראל ישראלי')).toBeInTheDocument();
    expect(users.searchUsers).toHaveBeenCalledWith('050-123');
  });
});

describe('suspending a user', () => {
  beforeEach(() => vi.mocked(users.suspendUser).mockReset());

  it('asks for a reason and sends it', async () => {
    vi.mocked(users.suspendUser).mockResolvedValueOnce({ ...user, status: 'suspended', changed: true });
    wrap(<UserView user={user} />);
    await userEvent.click(screen.getByRole('button', { name: 'השעה משתמש' }));
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'השעה' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('סיבת ההשעיה'), '  חשד להונאה ');
    await userEvent.click(confirm);
    expect(users.suspendUser).toHaveBeenCalledWith('u1', 'חשד להונאה');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('user detail view', () => {
  it('heads with the name and the local phone, in Hebrew, with signed amounts', () => {
    wrap(
      <UserView
        user={{
          ...user,
          walletTransactions: [
            { id: 't2', type: 'withdrawal_hold', amount: '-14.50', description: 'בקשת משיכה', createdAt: '2026-11-02T10:00:00Z' },
          ],
        }}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ישראל ישראלי');
    expect(screen.getByTestId('user-phone')).toHaveTextContent('050-1234567');
    expect(screen.getByText('משיכה (הקפאה)')).toBeInTheDocument();
    expect(screen.getByText('בקשת משיכה')).toBeInTheDocument();
    expect(screen.getByText('זכתה')).toBeInTheDocument();
    expect(screen.getByText('3900')).toBeInTheDocument();
    expect(screen.getByText('-₪14.50')).toHaveAttribute('dir', 'ltr');
  });
});

describe('audit actor', () => {
  it('shows the admin name, else the local phone, never the raw actor id', () => {
    const base = { actorType: 'admin', actorId: 'a1', adminName: null, adminPhone: null };
    expect(actorLabel({ ...base, adminName: 'אושרית', adminPhone: '+972521112233' })).toBe('אושרית');
    expect(actorLabel({ ...base, adminPhone: '+972521112233' })).toBe('052-1112233');
    expect(actorLabel({ ...base, actorType: 'system', actorId: null })).toBe('מערכת');
    expect(actorLabel({ ...base, actorType: 'user', actorId: 'u_7f3a9c21dana' })).toBe('לקוח 21dana');
  });
});
