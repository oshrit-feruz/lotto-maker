import { describe, expect, it } from 'vitest';
import { validateWithdrawal, withdrawalBody, type WithdrawalFields } from './withdrawal-form';

const card: WithdrawalFields = {
  amount: '150',
  method: 'card',
  savedCardId: '',
  holderName: '',
  bankCode: '',
  branchCode: '',
  accountNumber: '',
};
const bank: WithdrawalFields = {
  ...card,
  method: 'bank',
  holderName: ' ישראל ישראלי ',
  bankCode: '12',
  branchCode: '345',
  accountNumber: '123456',
};
const ok = { quoteProblem: null, savedCardCount: 1 };

describe('validateWithdrawal', () => {
  it('accepts a valid card or bank request', () => {
    expect(validateWithdrawal(card, ok)).toBeNull();
    expect(validateWithdrawal(bank, { ...ok, savedCardCount: 0 })).toBeNull();
  });

  it('checks the amount first, then the quote', () => {
    expect(validateWithdrawal({ ...card, amount: '' }, ok)).toBe('נא להזין סכום, עד שתי ספרות אחרי הנקודה.');
    expect(validateWithdrawal({ ...card, amount: '1.234' }, ok)).toBe('נא להזין סכום, עד שתי ספרות אחרי הנקודה.');
    expect(validateWithdrawal({ ...card, amount: '0.00' }, ok)).toBe('נא להזין סכום חיובי.');
    expect(validateWithdrawal(card, { ...ok, quoteProblem: 'מתחת למינימום' })).toBe('מתחת למינימום');
  });

  it('needs a saved card for a card withdrawal', () => {
    expect(validateWithdrawal(card, { ...ok, savedCardCount: 0 })).toBe('אין כרטיס שמור למשיכה. בחרו העברה בנקאית.');
  });

  it('checks the bank fields in order', () => {
    expect(validateWithdrawal({ ...bank, holderName: ' א ' }, ok)).toBe('נא להזין את שם בעל החשבון.');
    expect(validateWithdrawal({ ...bank, bankCode: '1234' }, ok)).toBe('קוד בנק: עד 3 ספרות.');
    expect(validateWithdrawal({ ...bank, branchCode: '' }, ok)).toBe('מספר סניף: עד 4 ספרות.');
    expect(validateWithdrawal({ ...bank, accountNumber: '123' }, ok)).toBe('מספר חשבון: 4 עד 12 ספרות.');
  });
});

describe('withdrawalBody', () => {
  it('sends the chosen card only when one is picked', () => {
    expect(withdrawalBody(card)).toEqual({ amount: 150, method: 'card' });
    expect(withdrawalBody({ ...card, savedCardId: 'c1' })).toEqual({ amount: 150, method: 'card', savedCardId: 'c1' });
  });

  it('sends the bank details with a trimmed holder name', () => {
    expect(withdrawalBody(bank)).toEqual({
      amount: 150,
      method: 'bank',
      bank: { holderName: 'ישראל ישראלי', bankCode: '12', branchCode: '345', accountNumber: '123456' },
    });
  });
});
