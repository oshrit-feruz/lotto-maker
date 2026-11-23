import type { WithdrawalMethod } from './withdrawal-quote';

/** What the withdrawal form holds (all as typed). */
export interface WithdrawalFields {
  amount: string;
  method: WithdrawalMethod;
  savedCardId: string;
  holderName: string;
  bankCode: string;
  branchCode: string;
  accountNumber: string;
}

/** Facts from outside the form that validation needs. */
export interface WithdrawalContext {
  /** The quote's reason for refusing this amount, if any. */
  quoteProblem: string | null;
  savedCardCount: number;
}

export type WithdrawalBody =
  | { amount: number; method: 'card'; savedCardId?: string }
  | {
      amount: number;
      method: 'bank';
      bank: { holderName: string; bankCode: string; branchCode: string; accountNumber: string };
    };

function bankError(f: WithdrawalFields): string | null {
  if (f.holderName.trim().length < 2) return 'נא להזין את שם בעל החשבון.';
  if (!/^\d{1,3}$/.test(f.bankCode)) return 'קוד בנק: עד 3 ספרות.';
  if (!/^\d{1,4}$/.test(f.branchCode)) return 'מספר סניף: עד 4 ספרות.';
  if (!/^\d{4,12}$/.test(f.accountNumber)) return 'מספר חשבון: 4 עד 12 ספרות.';
  return null;
}

/** The first problem with the form, in Hebrew, or null when it can be sent. */
export function validateWithdrawal(f: WithdrawalFields, ctx: WithdrawalContext): string | null {
  if (!/^\d+(\.\d{1,2})?$/.test(f.amount)) return 'נא להזין סכום, עד שתי ספרות אחרי הנקודה.';
  if (Number(f.amount) <= 0) return 'נא להזין סכום חיובי.';
  if (ctx.quoteProblem) return ctx.quoteProblem;
  if (f.method === 'card') return ctx.savedCardCount === 0 ? 'אין כרטיס שמור למשיכה. בחרו העברה בנקאית.' : null;
  return bankError(f);
}

/** POST /wallet/withdrawals body for a validated form. No savedCardId means the default card. */
export function withdrawalBody(f: WithdrawalFields): WithdrawalBody {
  const amount = Number(f.amount);
  if (f.method === 'card') return { amount, method: 'card', ...(f.savedCardId ? { savedCardId: f.savedCardId } : {}) };
  const { bankCode, branchCode, accountNumber } = f;
  return { amount, method: 'bank', bank: { holderName: f.holderName.trim(), bankCode, branchCode, accountNumber } };
}
