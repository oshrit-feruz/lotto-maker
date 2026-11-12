import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toError } from '../api/client';
import type { PrizeClaim } from '../api/types';
import { jerusalemLocalToIso, toJerusalemLocalInput } from '../lib/format';
import PrizeClaimsPage, { slotError } from './PrizeClaimsPage';
import * as claims from '../api/claims';

vi.mock('../api/claims', () => ({ listClaims: vi.fn(), collectClaim: vi.fn(), scheduleClaim: vi.fn() }));

const claim: PrizeClaim = {
  id: 'c1',
  orderId: 'order-0001',
  amount: '1500.00',
  status: 'awaiting_pickup',
  scheduledAt: null,
  collectedAt: null,
  expiresAt: '2027-05-01T21:00:00.000Z',
  createdAt: '2026-11-01T10:00:00.000Z',
  claimantName: 'ישראל ישראלי',
  claimantPhone: '+972501234567',
  claimantIdLast4: '4321',
  scheduledFor: null,
  drawNumber: 3901,
};

const apiError = (status: number, code: string) => toError({ status }, { error: code, message: `english ${code}` });

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PrizeClaimsPage />
    </QueryClientProvider>,
  );
}

async function openCollect() {
  renderPage();
  await screen.findByText('ישראל ישראלי');
  await userEvent.click(screen.getByRole('button', { name: 'מסור' }));
  return screen.getByRole('dialog');
}

describe('prize claim collect flow', () => {
  beforeEach(() => {
    vi.mocked(claims.listClaims).mockReset().mockResolvedValue([claim]);
    vi.mocked(claims.collectClaim).mockReset();
  });

  it('never shows or prefills the claimant’s ID last 4', async () => {
    const dialog = await openCollect();
    expect(screen.queryByText(/4321/)).toBeNull();
    expect(document.body.innerHTML).not.toContain('4321');
    expect(within(dialog).getByLabelText('4 ספרות אחרונות של תעודת הזהות')).toHaveValue('');
    expect(within(dialog).getByRole('button', { name: 'סמן כנאסף' })).toBeDisabled();
  });

  it('sends the typed digits, closes and reloads the list on success', async () => {
    vi.mocked(claims.collectClaim).mockResolvedValueOnce({ ...claim, status: 'collected', collectedAt: '2026-11-12T10:00:00Z' });
    const dialog = await openCollect();
    await userEvent.type(within(dialog).getByLabelText('4 ספרות אחרונות של תעודת הזהות'), '4321');
    await userEvent.click(within(dialog).getByRole('button', { name: 'סמן כנאסף' }));
    expect(claims.collectClaim).toHaveBeenCalledWith('c1', '4321');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(claims.listClaims).toHaveBeenCalledTimes(2));
  });

  it('shows the Hebrew message for a wrong ID from the server and keeps the dialog open', async () => {
    vi.mocked(claims.collectClaim).mockRejectedValueOnce(apiError(422, 'ID_MISMATCH'));
    const dialog = await openCollect();
    await userEvent.type(within(dialog).getByLabelText('4 ספרות אחרונות של תעודת הזהות'), '4321');
    await userEvent.click(within(dialog).getByRole('button', { name: 'סמן כנאסף' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('הספרות אינן תואמות לתעודת הזהות של הזוכה');
    expect(screen.queryByText(/english/)).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(claims.listClaims).toHaveBeenCalledTimes(1);
  });

  it('reloads the list when the claim was already collected', async () => {
    vi.mocked(claims.collectClaim).mockRejectedValueOnce(apiError(409, 'CLAIM_ALREADY_COLLECTED'));
    const dialog = await openCollect();
    await userEvent.type(within(dialog).getByLabelText('4 ספרות אחרונות של תעודת הזהות'), '4321');
    await userEvent.click(within(dialog).getByRole('button', { name: 'סמן כנאסף' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('הזכייה כבר נמסרה');
    await waitFor(() => expect(claims.listClaims).toHaveBeenCalledTimes(2));
  });
});

describe('collect error mapping', () => {
  it.each([
    ['ID_MISMATCH', 422, 'הספרות אינן תואמות לתעודת הזהות של הזוכה'],
    ['ID_NOT_ON_FILE', 422, 'אין לזוכה תעודת זהות מאומתת'],
    ['CLAIM_EXPIRED', 409, 'תוקף הזכייה פג'],
    ['CLAIM_NOT_OPEN', 409, 'אינה פתוחה'],
    ['CLAIM_NOT_FOUND', 404, 'הזכייה לא נמצאה'],
    ['VALIDATION_ERROR', 400, 'אינם תקינים'],
  ])('%s -> Hebrew', (code, status, text) => {
    const e = apiError(status, code);
    expect(e.code).toBe(code);
    expect(e.status).toBe(status);
    expect(e.message).toContain(text);
  });

  it('falls back to the backend message for an unknown code', () => {
    expect(toError({ status: 418 }, { error: 'TEAPOT', message: 'short and stout' }).message).toBe('short and stout');
    expect(toError({ status: 502 }, undefined).message).toBe('שגיאה 502');
  });
});

describe('scheduling', () => {
  it('reads the picked time as Israel time', () => {
    expect(jerusalemLocalToIso('2026-12-01T09:30')).toBe('2026-12-01T07:30:00.000Z'); // winter, +02:00
    expect(jerusalemLocalToIso('2026-07-01T09:30')).toBe('2026-07-01T06:30:00.000Z'); // summer, +03:00
    expect(jerusalemLocalToIso('')).toBeNull();
    expect(toJerusalemLocalInput('2026-12-01T07:30:00.000Z')).toBe('2026-12-01T09:30');
  });

  it('accepts only a future slot before the claim expires', () => {
    const now = new Date('2026-11-12T10:00:00Z');
    expect(slotError('2026-11-12T11:00', claim.expiresAt, now)).toBe('המועד חייב להיות בעתיד');
    expect(slotError('2026-12-01T09:30', claim.expiresAt, now)).toBeNull();
    expect(slotError('2027-06-01T09:30', claim.expiresAt, now)).toBe('המועד חייב להיות לפני תום תוקף הזכייה');
  });

  it('sends scheduledFor as an ISO instant', async () => {
    const day = 24 * 60 * 60 * 1000;
    const open = { ...claim, expiresAt: new Date(Date.now() + 90 * day).toISOString() };
    vi.mocked(claims.listClaims).mockReset().mockResolvedValue([open]);
    vi.mocked(claims.scheduleClaim).mockReset().mockResolvedValueOnce({ ...open, status: 'scheduled' });
    renderPage();
    await screen.findByText('ישראל ישראלי');
    await userEvent.click(screen.getByRole('button', { name: 'קבע מועד' }));
    const dialog = screen.getByRole('dialog');
    const slot = toJerusalemLocalInput(new Date(Date.now() + 30 * day));
    fireEvent.change(within(dialog).getByLabelText('תאריך ושעה (שעון ישראל)'), { target: { value: slot } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'קבע' }));
    expect(claims.scheduleClaim).toHaveBeenCalledWith('c1', jerusalemLocalToIso(slot));
  });
});
