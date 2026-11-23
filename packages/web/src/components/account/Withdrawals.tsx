'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { formatShekel, formatShortDateTime } from '@/lib/format';
import { WITHDRAWAL_STATUS_LABELS } from '@/lib/labels';
import type { SavedCardView, WithdrawalQuote, WithdrawalView } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { validateWithdrawal, withdrawalBody, type WithdrawalFields } from '@/lib/withdrawal-form';
import {
  QUOTE_DEBOUNCE_MS,
  describeQuote,
  quoteMatches,
  quotePath,
  type QuoteDisplay,
  type WithdrawalMethod,
} from '@/lib/withdrawal-quote';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorNotice, Loading, NotAvailable } from './Notice';

const EMPTY_FIELDS: WithdrawalFields = {
  amount: '',
  method: 'card',
  savedCardId: '',
  holderName: '',
  bankCode: '',
  branchCode: '',
  accountNumber: '',
};

type SetField = <K extends keyof WithdrawalFields>(key: K, value: WithdrawalFields[K]) => void;

/** A quote as the form shows it, with the minimum for the note under it. */
type ShownQuote = QuoteDisplay & { min: string };

const digitsOnly = (s: string) => s.replace(/\D/g, '');

/** Fee, net amount and minimum from GET /wallet/withdrawals/quote, asked once typing pauses. */
function useWithdrawalQuote(amount: string, method: WithdrawalMethod) {
  const [debouncedPath, setDebouncedPath] = useState<string | null>(null);
  const wantedPath = quotePath(amount, method);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPath(wantedPath), QUOTE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [wantedPath]);
  const quoteState = useApi<WithdrawalQuote>(debouncedPath);
  const quote = wantedPath && quoteMatches(quoteState.data, amount, method) ? quoteState.data : null;
  const shown: ShownQuote | null = quote ? { ...describeQuote(quote), min: quote.min } : null;
  return {
    shown,
    pending: wantedPath !== null && (quoteState.loading || wantedPath !== debouncedPath),
  };
}

/**
 * Withdrawals, Phase 3 contract:
 * POST /wallet/withdrawals {amount, method: 'card'|'bank', savedCardId?, bank?},
 * GET /wallet/withdrawals, POST /wallet/withdrawals/:id/cancel, and
 * GET /wallet/withdrawals/quote?amount=&method= for the fee, net amount and minimum before sending.
 * Statuses: requested | approved | rejected | paid | failed | cancelled (only `requested` can be cancelled).
 */
export function Withdrawals() {
  const list = useApi<WithdrawalView[]>('wallet/withdrawals');
  const cards = useApi<SavedCardView[]>('me/cards');

  const [fields, setFields] = useState<WithdrawalFields>(EMPTY_FIELDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<WithdrawalView | null>(null);
  const { shown, pending } = useWithdrawalQuote(fields.amount, fields.method);

  const setField: SetField = (key, value) => setFields((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const v = validateWithdrawal(fields, { quoteProblem: shown?.problem ?? null, savedCardCount: cards.data?.length ?? 0 });
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    try {
      const w = await api.post<WithdrawalView>('wallet/withdrawals', withdrawalBody(fields));
      const feePart = Number(w.fee) > 0 ? `, עמלה ${formatShekel(w.fee)}` : '';
      setNotice(`בקשת המשיכה התקבלה: ${formatShekel(w.amount)}${feePart}, תקבלו ${formatShekel(w.payout)}.`);
      setFields((f) => ({ ...f, amount: '', accountNumber: '' }));
      list.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    setCancelling(null);
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
              value={fields.amount}
              onChange={(e) => setField('amount', e.target.value.replace(/[^\d.]/g, ''))}
            />
          </div>
          <div className="field">
            <label htmlFor="w-method">לאן</label>
            <select id="w-method" value={fields.method} onChange={(e) => setField('method', e.target.value as WithdrawalMethod)}>
              <option value="card">לכרטיס האשראי</option>
              <option value="bank">העברה בנקאית</option>
            </select>
          </div>
        </div>
        {fields.method === 'card' ? (
          <CardChoice cards={cards.data} value={fields.savedCardId} onChange={(id) => setField('savedCardId', id)} />
        ) : (
          <BankFields fields={fields} setField={setField} />
        )}
        <div aria-live="polite">
          <QuotePreview shown={shown} pending={pending} />
        </div>
        <button className="btn" type="submit" disabled={busy || (shown !== null && !shown.canSubmit)}>
          {busy ? 'שולח…' : 'בקשת משיכה'}
        </button>
      </form>

      <h3 style={{ marginTop: 20 }}>בקשות משיכה</h3>
      {list.loading && !list.data ? <Loading /> : null}
      {list.error ? <ErrorNotice message={list.error} onRetry={list.reload} /> : null}
      {list.data && list.data.length === 0 ? <p className="muted empty-note">אין בקשות משיכה.</p> : null}
      {list.data && list.data.length > 0 ? <WithdrawalsTable rows={list.data} onCancel={setCancelling} /> : null}
      {cancelling ? (
        <ConfirmDialog
          title="לבטל את בקשת המשיכה?"
          confirmLabel="ביטול הבקשה"
          cancelLabel="חזרה"
          danger
          onConfirm={() => void cancel(cancelling.id)}
          onCancel={() => setCancelling(null)}
        >
          <p>
            {'הבקשה למשיכת '}
            <span dir="ltr">{formatShekel(cancelling.amount)}</span>
            {' תבוטל והסכום יישאר בארנק.'}
          </p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function CardChoice({
  cards,
  value,
  onChange,
}: Readonly<{ cards: SavedCardView[] | null; value: string; onChange: (id: string) => void }>) {
  if (!cards || cards.length === 0) {
    return <p className="small muted">אין כרטיס שמור. כרטיס נשמר אוטומטית אחרי טעינה בכרטיס.</p>;
  }
  return (
    <div className="field">
      <label htmlFor="w-card">כרטיס</label>
      <select id="w-card" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">ברירת מחדל</option>
        {cards.map((c) => (
          <option key={c.id} value={c.id}>
            {/* LRI…PDI keeps the dots before the digits inside RTL text (no markup in an option). */}
            {c.brand ?? 'כרטיס'} {'⁦'}•••• {c.last4}{'⁩'}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A digits-only, left-to-right bank field. */
function DigitsField({
  id,
  label,
  maxLength,
  value,
  onChange,
}: Readonly<{ id: string; label: string; maxLength: number; value: string; onChange: (v: string) => void }>) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        inputMode="numeric"
        dir="ltr"
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
      />
    </div>
  );
}

function BankFields({ fields, setField }: Readonly<{ fields: WithdrawalFields; setField: SetField }>) {
  return (
    <div className="grid-2">
      <div className="field">
        <label htmlFor="w-holder">שם בעל החשבון</label>
        <input
          id="w-holder"
          className="input"
          value={fields.holderName}
          onChange={(e) => setField('holderName', e.target.value)}
        />
        <div className="small muted">חייב להתאים לשם בפרופיל.</div>
      </div>
      <DigitsField id="w-bank" label="קוד בנק" maxLength={3} value={fields.bankCode} onChange={(v) => setField('bankCode', v)} />
      <DigitsField
        id="w-branch"
        label="מספר סניף"
        maxLength={4}
        value={fields.branchCode}
        onChange={(v) => setField('branchCode', v)}
      />
      <DigitsField
        id="w-account"
        label="מספר חשבון"
        maxLength={12}
        value={fields.accountNumber}
        onChange={(v) => setField('accountNumber', v)}
      />
    </div>
  );
}

function QuotePreview({ shown, pending }: Readonly<{ shown: ShownQuote | null; pending: boolean }>) {
  if (!shown) {
    return (
      <p className="small muted">
        {pending
          ? 'מחשבים עמלה וסכום לקבלה…'
          : 'העמלה והסכום שתקבלו יוצגו כאן לפני השליחה. משיכות נבדקות ומאושרות לפני תשלום.'}
      </p>
    );
  }
  return (
    <>
      <ul className="price-lines">
        {shown.lines.map((l) => (
          <li key={l.label}>
            <span>{l.label}</span>
            <span dir="ltr">{l.value}</span>
          </li>
        ))}
      </ul>
      {shown.problem ? <div className="alert alert-warn small">{shown.problem}</div> : null}
      <p className="small muted">
        מינימום למשיכה: <span dir="ltr">{formatShekel(shown.min)}</span>. משיכות נבדקות ומאושרות לפני
        תשלום.
      </p>
    </>
  );
}

function WithdrawalsTable({
  rows,
  onCancel,
}: Readonly<{ rows: WithdrawalView[]; onCancel: (w: WithdrawalView) => void }>) {
  return (
    <div className="table-wrap">
      <table className="table table-cards withdrawal-table">
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
          {rows.map((w) => (
            <WithdrawalRow key={w.id} w={w} onCancel={onCancel} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WithdrawalRow({ w, onCancel }: Readonly<{ w: WithdrawalView; onCancel: (w: WithdrawalView) => void }>) {
  return (
    <tr>
      <td className="small cell-date nowrap">{formatShortDateTime(w.createdAt)}</td>
      <td className="cell-amount">
        <span dir="ltr" className="amount">
          {formatShekel(w.amount)}
        </span>
      </td>
      <td className="small cell-dest">
        {w.method === 'card' ? (
          'כרטיס'
        ) : (
          <>
            בנק{' '}
            {w.bankAccountLast4 ? <span dir="ltr">••{w.bankAccountLast4}</span> : null}
          </>
        )}
      </td>
      <td className="small cell-status">
        {WITHDRAWAL_STATUS_LABELS[w.status] ?? w.status}
        {w.failureReason ? ` (${w.failureReason})` : ''}
      </td>
      <td className="cell-action">
        {w.status === 'requested' ? (
          <button className="btn btn-danger btn-sm" onClick={() => onCancel(w)}>
            ביטול
          </button>
        ) : null}
      </td>
    </tr>
  );
}
