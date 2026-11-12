import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectClaimDialog from './CollectClaimDialog';
import { isIdLast4Valid } from '../lib/idCheck';

describe('isIdLast4Valid', () => {
  it('requires exactly 4 digits matching the claimant', () => {
    expect(isIdLast4Valid('1234', '1234')).toBe(true);
    expect(isIdLast4Valid('1235', '1234')).toBe(false);
    expect(isIdLast4Valid('123', '1234')).toBe(false);
    expect(isIdLast4Valid('12a4', null)).toBe(false);
  });
  it('never accepts anything when the expected value is unknown', () => {
    expect(isIdLast4Valid('9999', null)).toBe(false);
    expect(isIdLast4Valid('9999', undefined)).toBe(false);
    expect(isIdLast4Valid('9999', '')).toBe(false);
  });
});

describe('CollectClaimDialog', () => {
  const claim = { amount: '1500', claimantIdLast4: '4321', claimantPhone: '+972501234567' };

  it('keeps Collect disabled until the ID last 4 match', async () => {
    const onConfirm = vi.fn();
    render(<CollectClaimDialog claim={claim} onConfirm={onConfirm} onCancel={() => {}} />);
    const button = screen.getByRole('button', { name: 'סמן כנאסף' });
    expect(screen.getByText('₪1,500.00')).toBeInTheDocument();
    expect(button).toBeDisabled();

    const input = screen.getByLabelText('4 ספרות אחרונות של תעודת הזהות');
    await userEvent.type(input, '1111');
    expect(button).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('הספרות אינן תואמות');

    await userEvent.clear(input);
    await userEvent.type(input, '4321');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith('4321');
  });

  it('explains and keeps Collect disabled when the claimant ID is unknown', () => {
    render(<CollectClaimDialog claim={{ ...claim, claimantIdLast4: null }} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('תעודת הזהות של הזוכה אינה זמינה');
    expect(screen.getByRole('button', { name: 'סמן כנאסף' })).toBeDisabled();
    expect(screen.getByLabelText('4 ספרות אחרונות של תעודת הזהות')).toBeDisabled();
  });
});
