import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { toError } from '../api/client';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DrawDetail } from '../api/types';
import { isDrawReadOnly, toBody, toForm } from '../lib/drawForm';
import { DrawEditor } from './DrawDetailPage';
import * as draws from '../api/draws';

vi.mock('../api/draws', () => ({ getDraw: vi.fn(), editDrawResults: vi.fn(), confirmDraw: vi.fn(), listDraws: vi.fn() }));

const base: DrawDetail = {
  id: 'd1',
  drawNumber: 3900,
  drawAt: '2026-11-10T19:00:00Z',
  salesCloseAt: '2026-11-10T17:00:00Z',
  status: 'results_suggested',
  suggestedAt: null,
  confirmedAt: null,
  settledAt: null,
  needsAttention: false,
  attentionReason: null,
  updatedAt: '2026-11-10T19:30:00.123Z',
  numbers: [1, 2, 3, 4, 5, 6],
  strong: 7,
  extraDigits: [1, 2, 3, 4, 5, 6],
  prizeTiers: [{ game: 'lotto', tier: '6+s', winnersCount: 1, prizeAmount: '1000000' }],
};

function renderEditor(draw: DrawDetail) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DrawEditor draw={draw} />
    </QueryClientProvider>,
  );
}

describe('isDrawReadOnly', () => {
  it('locks settled draws and confirmed draws that do not need attention', () => {
    expect(isDrawReadOnly({ status: 'settled', needsAttention: false })).toBe(true);
    expect(isDrawReadOnly({ status: 'settled', needsAttention: true })).toBe(true);
    expect(isDrawReadOnly({ status: 'results_confirmed', needsAttention: false })).toBe(true);
    expect(isDrawReadOnly({ status: 'results_confirmed', needsAttention: true })).toBe(false);
    expect(isDrawReadOnly({ status: 'results_suggested', needsAttention: false })).toBe(false);
    expect(isDrawReadOnly({ status: 'scheduled', needsAttention: false })).toBe(false);
  });
});

describe('toBody', () => {
  it('rejects a tier with a winners count but no prize amount', () => {
    const f = toForm(base);
    f.tiers['double:5'] = { winners: '3', amount: '' };
    expect(toBody(f)).toBe('בטבלת דאבל לוטו (5) הוזן מספר זוכים ללא סכום פרס');
  });
  it('skips fully empty tiers and keeps filled ones', () => {
    const body = toBody(toForm(base));
    expect(body).toMatchObject({ prizeTiers: [{ game: 'lotto', tier: '6+s', winnersCount: 1, prizeAmount: 1000000 }] });
  });
});

describe('DrawEditor', () => {
  beforeEach(() => vi.mocked(draws.editDrawResults).mockReset());

  it('is editable for a confirmed draw that needs attention', () => {
    renderEditor({ ...base, status: 'results_confirmed', needsAttention: true, attentionReason: 'x' });
    expect(screen.getByLabelText('מספר 1')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'שמור שינויים' })).toBeInTheDocument();
  });

  it('is read-only for a confirmed draw without attention', () => {
    renderEditor({ ...base, status: 'results_confirmed' });
    expect(screen.getByLabelText('מספר 1')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'שמור שינויים' })).toBeNull();
  });

  it('clears the form error once a field is edited', async () => {
    renderEditor(base);
    await userEvent.type(screen.getByLabelText('דאבל לוטו 5 זוכים'), '3');
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    expect(screen.getByRole('alert')).toHaveTextContent('ללא סכום פרס');
    expect(draws.editDrawResults).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('דאבל לוטו 5 פרס'), '100');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('disables inputs while saving and clears the previous save error on a new save', async () => {
    let finish!: (d: DrawDetail) => void;
    vi.mocked(draws.editDrawResults)
      .mockRejectedValueOnce(new Error('נכשל'))
      .mockImplementationOnce(() => new Promise<DrawDetail>((r) => (finish = r)));
    renderEditor(base);
    const input = screen.getByLabelText('מספר 1');
    await userEvent.clear(input);
    await userEvent.type(input, '9');
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('נכשל');

    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('מספר 1')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'שומר…' })).toBeDisabled();
    finish({ ...base, numbers: [9, 2, 3, 4, 5, 6] });
  });
});

describe('confirming results', () => {
  beforeEach(() => vi.mocked(draws.confirmDraw).mockReset());

  const openAndConfirm = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'אשר תוצאות' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'אשר תוצאות' }));
  };

  it('sends the reviewed draw’s updatedAt as expectedUpdatedAt', async () => {
    vi.mocked(draws.confirmDraw).mockResolvedValueOnce({ ...base, status: 'results_confirmed' });
    renderEditor(base);
    await openAndConfirm();
    expect(draws.confirmDraw).toHaveBeenCalledWith('d1', '2026-11-10T19:30:00.123Z');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('on 409 RESULTS_CHANGED closes the dialog, shows a Hebrew message and refetches the draw', async () => {
    const qc = new QueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    vi.mocked(draws.confirmDraw).mockRejectedValueOnce(toError({ status: 409 }, { error: 'RESULTS_CHANGED', message: 'The results changed' }));
    render(
      <QueryClientProvider client={qc}>
        <DrawEditor draw={base} />
      </QueryClientProvider>,
    );
    await openAndConfirm();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('התוצאות השתנו מאז שנבדקו');
    expect(alert).not.toHaveTextContent('The results changed');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['draw', 'd1'] });

    // Opening the dialog again clears the notice; the new confirm carries the draw's updatedAt.
    vi.mocked(draws.confirmDraw).mockResolvedValueOnce({ ...base, status: 'results_confirmed' });
    await openAndConfirm();
    expect(screen.queryByText(/התוצאות השתנו/)).toBeNull();
    expect(draws.confirmDraw).toHaveBeenCalledTimes(2);
  });
});
