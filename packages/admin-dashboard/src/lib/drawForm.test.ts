import { describe, expect, it } from 'vitest';
import { tierId, toBody, type DrawForm } from './drawForm';

function form(overrides: Partial<DrawForm> = {}, tiers: DrawForm['tiers'] = {}): DrawForm {
  return {
    numbers: ['1', '2', '3', '4', '5', '6'],
    strong: '7',
    extraDigits: ['1', '2', '3', '4', '5', '6'],
    tiers: { [tierId('lotto', '6+s')]: { winners: '1', amount: '1000000' }, ...tiers },
    ...overrides,
  };
}

describe('toBody', () => {
  it('builds the request body from a valid form', () => {
    const body = toBody(form({}, { [tierId('extra', '2')]: { winners: ' ', amount: ' 10.5 ' } }));
    expect(body).toEqual({
      numbers: [1, 2, 3, 4, 5, 6],
      strong: 7,
      extraDigits: [1, 2, 3, 4, 5, 6],
      prizeTiers: [
        { game: 'lotto', tier: '6+s', winnersCount: 1, prizeAmount: 1000000 },
        { game: 'extra', tier: '2', winnersCount: 0, prizeAmount: 10.5 },
      ],
    });
  });

  it.each([
    [{ numbers: ['1', '2', '3', '4', '5', ''] }, 'המספרים חייבים להיות 1–37'],
    [{ numbers: ['1', '2', '3', '4', '5', '38'] }, 'המספרים חייבים להיות 1–37'],
    [{ numbers: ['1', '2', '3', '4', '5', '2.5'] }, 'המספרים חייבים להיות 1–37'],
    [{ numbers: ['1', '2', '3', '4', '5', '5'] }, 'המספרים חייבים להיות שונים'],
    [{ strong: '' }, 'המספר החזק חייב להיות 1–7'],
    [{ strong: '8' }, 'המספר החזק חייב להיות 1–7'],
    [{ extraDigits: ['1', '2', '3', '4', '5', '0'] }, 'ספרות אקסטרה חייבות להיות 1–7'],
    [{ extraDigits: ['1', '2', '3', '4', '5', ''] }, 'ספרות אקסטרה חייבות להיות 1–7'],
  ])('rejects %j', (overrides, message) => {
    expect(toBody(form(overrides))).toBe(message);
  });

  it('allows repeated extra digits', () => {
    expect(typeof toBody(form({ extraDigits: ['1', '1', '1', '1', '1', '1'] }))).toBe('object');
  });

  it('rejects winners without a prize amount and invalid tier values', () => {
    expect(toBody(form({}, { [tierId('double', '5')]: { winners: '3', amount: '' } }))).toBe(
      'בטבלת דאבל לוטו (5) הוזן מספר זוכים ללא סכום פרס',
    );
    expect(toBody(form({}, { [tierId('lotto', '3')]: { winners: '1.5', amount: '10' } }))).toBe(
      'ערך לא תקין בטבלת לוטו (3)',
    );
    expect(toBody(form({}, { [tierId('extra', '4')]: { winners: '1', amount: '-1' } }))).toBe(
      'ערך לא תקין בטבלת אקסטרה (4)',
    );
  });

  it('needs at least one prize tier', () => {
    expect(toBody(form({ tiers: {} }))).toBe('יש להזין לפחות דרגת פרס אחת');
  });
});
