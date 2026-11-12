'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { TICKET_TYPE_LABELS, getSystematicRule } from '@lotto-maker/shared';
import { api, errorMessage } from '@/lib/api-client';
import { clearDraft, loadDraft, savePendingPayment } from '@/lib/draft';
import { formatShekel } from '@/lib/format';
import { isSafeRedirect, newIdempotencyKey, placeOrder } from '@/lib/orders';
import { buildPriceDisplay, topUpAmount } from '@/lib/price';
import { isTicketComplete, sanitize, toTicketInput, type TicketState } from '@/lib/ticket-state';
import type { CalculateResponse, CheckoutResponse, CreateOrderResponse, Me } from '@/lib/types';
import { Balls } from '../Balls';
import { ProfileForm } from '../ProfileForm';
import { PriceSummary } from '../ticket/PriceSummary';
import { OrderPlaced } from './OrderPlaced';

export function CheckoutView() {
  const [ticket, setTicket] = useState<TicketState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [calc, setCalc] = useState<CalculateResponse | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<CreateOrderResponse | null>(null);

  const load = useCallback(async (t: TicketState) => {
    setError(null);
    try {
      const [c, m, b] = await Promise.all([
        api.post<CalculateResponse>('tickets/calculate', toTicketInput(t)),
        api.get<Me>('me'),
        api.get<{ balance: string }>('wallet/balance'),
      ]);
      setCalc(c);
      setMe(m);
      setBalance(b.balance);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    const draft = loadDraft();
    const t = draft ? sanitize(draft) : null;
    const usable = t && isTicketComplete(t) ? t : null;
    setTicket(usable);
    setLoaded(true);
    if (usable) void load(usable);
  }, [load]);

  if (placed) return <OrderPlaced result={placed} />;
  if (!loaded) return <p className="muted">טוען…</p>;
  if (!ticket) {
    return (
      <div className="card">
        <p>אין טופס לתשלום.</p>
        <Link className="btn" href="/ticket">
          למילוי טופס
        </Link>
      </div>
    );
  }

  const missing = calc && balance !== null ? topUpAmount(calc.total, balance) : null;

  async function payFromWallet() {
    if (!ticket) return;
    setBusy(true);
    setError(null);
    try {
      const result = await placeOrder(ticket);
      clearDraft();
      setPlaced(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function topUp() {
    if (!calc || missing === null || missing <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<CheckoutResponse>('payments/checkout', {
        amount: missing,
        idempotencyKey: newIdempotencyKey(),
      });
      if (!isSafeRedirect(res.checkoutUrl)) throw new Error('bad checkout url');
      savePendingPayment({ paymentId: res.paymentId, total: calc.total });
      window.location.assign(res.checkoutUrl);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const rule = ticket.systematicType ? getSystematicRule(ticket.systematicType) : null;

  return (
    <div className="grid-2">
      <section className="card">
        <h2>הטופס</h2>
        <p>
          {TICKET_TYPE_LABELS[ticket.type]}
          {rule ? `, ${rule.label}` : ''}, {ticket.tables.length} טבלאות
          {ticket.extra ? ', עם אקסטרה' : ''}, {ticket.drawCount === 1 ? 'הגרלה אחת' : `${ticket.drawCount} הגרלות`}
        </p>
        <ol style={{ paddingInlineStart: 20 }}>
          {ticket.tables.map((t, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              <Balls numbers={t.numbers} strong={t.strongNumbers} />
            </li>
          ))}
        </ol>
        <Link href="/ticket">עריכת הטופס</Link>
      </section>

      <section className="card">
        <h2>סיכום</h2>
        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}
        {me && !me.verifiedAdult ? (
          <>
            <div className="alert alert-info">לפני ההזמנה הראשונה יש להשלים את פרטי הפרופיל.</div>
            <ProfileForm onDone={() => void load(ticket)} />
          </>
        ) : calc && balance !== null && missing !== null ? (
          <>
            <PriceSummary price={buildPriceDisplay(calc)} />
            <div className="spread price-total" style={{ margin: '8px 0' }}>
              <span>לתשלום</span>
              <span dir="ltr">{formatShekel(calc.total)}</span>
            </div>
            <div className="spread small">
              <span>יתרה בארנק</span>
              <span dir="ltr">{formatShekel(balance)}</span>
            </div>
            {!calc.enoughDraws ? null : missing === 0 ? (
              <button className="btn btn-block" style={{ marginTop: 12 }} onClick={payFromWallet} disabled={busy}>
                {busy ? 'מבצע הזמנה…' : 'תשלום מהארנק'}
              </button>
            ) : (
              <>
                <p className="small" style={{ marginTop: 12 }}>
                  חסרים <span dir="ltr">{formatShekel(missing)}</span> בארנק. נטען את הסכום בכרטיס אשראי בעמוד תשלום
                  מאובטח, ואז ההזמנה תבוצע מהארנק.
                </p>
                <button className="btn btn-block" onClick={topUp} disabled={busy}>
                  {busy ? 'מעביר לתשלום…' : `טעינה של ${formatShekel(missing)} ותשלום`}
                </button>
              </>
            )}
          </>
        ) : !error ? (
          <p className="muted">טוען…</p>
        ) : (
          <button className="btn btn-ghost" onClick={() => void load(ticket)}>
            נסו שוב
          </button>
        )}
      </section>
    </div>
  );
}
