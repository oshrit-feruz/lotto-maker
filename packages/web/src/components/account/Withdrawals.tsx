'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { formatDateTime, formatShekel } from '@/lib/format';
import { WITHDRAWAL_STATUS_LABELS } from '@/lib/labels';
import type { SavedCardView, WithdrawalView } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { ErrorNotice, Loading, NotAvailable } from './Notice';

type Method = 'card' | 'bank';

/**
 * Withdrawals, Phase 3 contract:
 * POST /wallet/withdrawals {amount, method: 'card'|'bank', savedCardId?, bank?},
 * GET /wallet/withdrawals, POST /wallet/withdrawals/:id/cancel.
 */
export function Withdrawals() {
  const list = useApi<WithdrawalView[]>('wallet/withdrawals');
  const cards = useApi<SavedCardView[]>('me/cards');

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('card');
  const [savedCardId, setSavedCardId] = useState('');
  const [holderName, setHolderName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function validate(): string | null {
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) return 'נא להזין סכום, עד שתי ספרות אחרי הנקודה.';
    if (Number(amount) <= 0) return 'נא להזין סכום חיובי.';
    if (method === 'card' && (cards.data?.length ?? 0) === 0) return 'אין כרטיס שמור למשיכה. בחרו העברה בנקאית.';
    if (method === 'bank') {
      if (holderName.trim().length < 2) return 'נא להזין את שם בעל החשבון.';
      if (!/^\d{1,3}$/.test(bankCode)) return 'קוד בנק: עד 3 ספרות.';
      if (!/^\d{1,4}$/.test(branchCode)) return 'מספר סניף: עד 4 ספרות.';
      if (!/^\d{4,12}$/.test(accountNumber)) return 'מספר חשבון: 4 עד 12 ספרות.';
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    try {
      const body =
        method === 'card'
          ? { amount: Number(amount), method, ...(savedCardId ? { savedCardId } : {}) }
          : {
              amount: Number(amount),
              method,
              bank: { holderName: holderName.trim(), bankCode, branchCode, accountNumber },
            };
      const w = await api.post<WithdrawalView>('wallet/withdrawals', body);
      setNotice(
        `בקשת המשיכה התקבלה: ${formatShekel(w.amount)}${Number(w.fee) > 0 ? `, עמלה ${formatShekel(w.fee)}` : ''}, תקבלו ${formatShekel(w.payout)}.`,
      );
      setAmount('');
      setAccountNumber('');
      list.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setError(null);
    try {
      await api.post(`wallet/withdrawals/${encodeURIComponent(id)}/cancel`);
      list.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (list.notAvailable) {
    return (
      <section className="card">
        <h2>משיכת כספים</h2>
        <NotAvailable what="משיכות" />
      </section>
    );
  }

  return (
    <section className="card">
      <h2>משיכת כספים</h2>
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? <div className="alert alert-ok">{notice}</div> : null}
      <form onSubmit={submit} noValidate>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="w-amount">סכום</label>
            <input
              id="w-amount"
              className="input"
              inputMode="decimal"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </div>
          <div className="field">
            <label htmlFor="w-method">לאן</label>
            <select id="w-method" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              <option value="card">לכרטיס האשראי</option>
              <option value="bank">העברה בנקאית</option>
            </select>
          </div>
        </div>
        {method === 'card' ? (
          cards.data && cards.data.length > 0 ? (
            <div className="field">
              <label htmlFor="w-card">כרטיס</label>
              <select id="w-card" value={savedCardId} onChange={(e) => setSavedCardId(e.target.value)}>
                <option value="">ברירת מחדל</option>
                {cards.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.brand ?? 'כרטיס'} •••• {c.last4}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="small muted">אין כרטיס שמור. כרטיס נשמר אוטומטית אחרי טעינה בכרטיס.</p>
          )
        ) : (
          <div className="grid-2">
            <div className="field">
              <label htmlFor="w-holder">שם בעל החשבון</label>
              <input id="w-holder" className="input" value={holderName} onChange={(e) => setHolderName(e.target.value)} />
              <div className="small muted">חייב להתאים לשם בפרופיל.</div>
            </div>
            <div className="field">
              <label htmlFor="w-bank">קוד בנק</label>
              <input
                id="w-bank"
                className="input"
                inputMode="numeric"
                dir="ltr"
                maxLength={3}
                value={bankCode}
                onChange={(e) => setBankCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="field">
              <label htmlFor="w-branch">מספר סניף</label>
              <input
                id="w-branch"
                className="input"
                inputMode="numeric"
                dir="ltr"
                maxLength={4}
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="field">
              <label htmlFor="w-account">מספר חשבון</label>
              <input
                id="w-account"
                className="input"
                inputMode="numeric"
                dir="ltr"
                maxLength={12}
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>
        )}
        <p className="small muted">בהעברה בנקאית עשויה לחול עמלה, שתוצג לפני האישור הסופי. משיכות נבדקות ומאושרות לפני תשלום.</p>
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'שולח…' : 'בקשת משיכה'}
        </button>
      </form>

      <h3 style={{ marginTop: 20 }}>בקשות משיכה</h3>
      {list.loading && !list.data ? <Loading /> : null}
      {list.error ? <ErrorNotice message={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.length === 0 ? <p className="muted">אין בקשות משיכה.</p> : null}
      {list.data && list.data.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>תאריך</th>
                <th>סכום</th>
                <th>יעד</th>
                <th>סטטוס</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((w) => (
                <tr key={w.id}>
                  <td className="small">{formatDateTime(w.createdAt)}</td>
                  <td dir="ltr">{formatShekel(w.amount)}</td>
                  <td className="small">{w.method === 'card' ? 'כרטיס' : `בנק${w.bankAccountLast4 ? ` ••${w.bankAccountLast4}` : ''}`}</td>
                  <td className="small">
                    {WITHDRAWAL_STATUS_LABELS[w.status] ?? w.status}
                    {w.failureReason ? ` (${w.failureReason})` : ''}
                  </td>
                  <td>
                    {w.status === 'requested' ? (
                      <button className="btn btn-danger btn-sm" onClick={() => void cancel(w.id)}>
                        ביטול
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
