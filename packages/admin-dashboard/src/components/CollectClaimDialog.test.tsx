import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CollectClaimDialog from './CollectClaimDialog';
import { isIdLast4Format } from '../lib/idCheck';

describe('isIdLast4Format', () => {
  it('accepts exactly 4 digits and nothing else', () => {
    expect(isIdLast4Format('1234')).toBe(true);
    expect(isIdLast4Format('0000')).toBe(true);
    expect(isIdLast4Format('123')).toBe(false);
    expect(isIdLast4Format('12345')).toBe(false);
    expect(isIdLast4Format('12a4')).toBe(false);
    expect(isIdLast4Format('')).toBe(false);
  });
});

describe('CollectClaimDialog', () => {
  const claim = { amount: '1500', claimantPhone: '+972501234567' };

  it('enables Collect once exactly 4 digits are typed and sends them; the server checks the match', async () => {
    const onConfirm = vi.fn();
    render(<CollectClaimDialog claim={claim} onConfirm={onConfirm} onCancel={() => {}} />);
    const button = screen.getByRole('button', { name: 'סמן כנאסף' });
    expect(screen.getByText('₪1,500.00')).toBeInTheDocument();
    expect(button).toBeDisabled();

    const input = screen.getByLabelText('4 ספרות אחרונות של תעודת הזהות');
    expect(input).toHaveValue('');
    await userEvent.type(input, '123');
    expect(button).toBeDisabled();
    await userEvent.type(input, '4');
    expect(button).toBeEnabled();
    // No client-side verdict: the dashboard does not know the claimant's digits
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith('1234');
  });

  it('keeps only digits, at most 4', async () => {
    render(<CollectClaimDialog claim={claim} onConfirm={() => {}} onCancel={() => {}} />);
    const input = screen.getByLabelText('4 ספרות אחרונות של תעודת הזהות');
    await userEvent.type(input, '1a2-3 456');
    expect(input).toHaveValue('1234');
  });

  it('shows the server error it is given', () => {
    render(
      <CollectClaimDialog
        claim={claim}
        error="הספרות אינן תואמות לתעודת הזהות של הזוכה – הזכייה לא נמסרה"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('הספרות אינן תואמות לתעודת הזהות של הזוכה');
  });
});
