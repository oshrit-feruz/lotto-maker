import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDrawDialog, { ESTIMATE_NOTE } from './ConfirmDrawDialog';
import { computePayout } from '../lib/payout';
import type { PrizeTier } from '../api/types';

const tiers: PrizeTier[] = [
  { game: 'lotto', tier: '6+s', winnersCount: 1, prizeAmount: '1000000.00' },
  { game: 'lotto', tier: '5', winnersCount: 3, prizeAmount: '1234.50' },
  { game: 'double', tier: '6', winnersCount: 2, prizeAmount: 500 },
  { game: 'extra', tier: '3', winnersCount: 10, prizeAmount: '0.10' },
];
const draw = { drawNumber: 3900, numbers: [1, 2, 3, 4, 5, 6], strong: 7, extraDigits: [1, 2, 3, 4, 5, 6], prizeTiers: tiers };

describe('computePayout', () => {
  it('sums winners × prize per game without float drift', () => {
    const p = computePayout(tiers);
    expect(p.perGame.lotto).toBe(1003703.5);
    expect(p.perGame.double).toBe(1000);
    expect(p.perGame.extra).toBe(1);
    expect(p.total).toBe(1004704.5);
    expect(p.winners).toBe(16);
  });
});

describe('ConfirmDrawDialog', () => {
  it('shows per-game and grand totals as a prize-table estimate, without promising payment', () => {
    render(<ConfirmDrawDialog draw={draw} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(ESTIMATE_NOTE)).toBeInTheDocument();
    expect(screen.getByText(/סה״כ משוער לפי טבלת הזכיות/)).toBeInTheDocument();
    expect(screen.getByText(/האישור מתחיל את סילוק הזכיות/)).toHaveTextContent('„שולמה”');
    expect(screen.queryByText(/ישולמו מיד|לתשלום/)).toBeNull();
    expect(screen.getByTestId('total-lotto')).toHaveTextContent('₪1,003,703.50');
    expect(screen.getByTestId('total-double')).toHaveTextContent('₪1,000.00');
    expect(screen.getByTestId('total-extra')).toHaveTextContent('₪1.00');
    expect(screen.getByTestId('grand-total')).toHaveTextContent('₪1,004,704.50');
  });

  it('calls onConfirm / onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDrawDialog draw={draw} onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'אשר תוצאות' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
