'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { TICKET_TYPE_LABELS, getSystematicRule } from '@lotto-maker/shared';
import { api, errorMessage } from '@/lib/api-client';
import { clearDraft, loadDraft, savePendingPayment } from '@/lib/draft';
import { formatShekel } from '@/lib/format';
import { isEmbeddablePaymentUrl } from '@/lib/hosted-payment';
import { checkoutReturnUrls, isSafeRedirect, newIdempotencyKey, placeOrder } from '@/lib/orders';
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
  // The provider's hosted card page, shown in an iframe here (Hyp); the mock is a full redirect
  const [frameUrl, setFrameUrl] = useState<string | null>(null);

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
  if (!loaded) return <p className="muted loading">טוען…</p>;
  if (!ticket) {
    return (
      <div className="card empty">
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
        // The hosted page sends the user back here with ?paymentId=<id> (422 INVALID_RETURN_URL
        // when this origin is not in the backend's CHECKOUT_RETURN_ORIGINS).
        ...checkoutReturnUrls(window.location.origin),
      });
      savePendingPayment({ paymentId: res.paymentId, total: calc.total });
      if (res.embed && isEmbeddablePaymentUrl(res.checkoutUrl)) {
        // The card page sends the whole window to /payment/success or /payment/canceled when done
        setFrameUrl(res.checkoutUrl);
        setBusy(false);
        return;
      }
      if (!isSafeRedirect(res.checkoutUrl)) throw new Error('bad checkout url');
      window.location.assign(res.checkoutUrl);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const rule = ticket.systematicType ? getSystematicRule(ticket.systematicType) : null;

  let payAction: ReactNode = null;
  if (calc?.enoughDraws && missing === 0) {
    payAction = (
      <button className="btn btn-block" style={{ marginTop: 12 }} onClick={payFromWallet} disabled={busy}>
        {busy ? 'מבצע הזמנה…' : 'תשלום מהארנק'}
      </button>
    );
  } else if (calc?.enoughDraws && missing !== null) {
    payAction = (
      <>
        <p className="small" style={{ marginTop: 12 }}>
          חסרים <span dir="ltr">{formatShekel(missing)}</span> בארנק. נטען את הסכום בכרטיס אשראי בעמוד תשלום
          מאובטח, ואז ההזמנה תבוצע מהארנק.
        </p>
        <button className="btn btn-block" onClick={topUp} disabled={busy}>
          {busy ? 'מעביר לתשלום…' : `טעינה של ${formatShekel(missing)} ותשלום`}
        </button>
      </>
    );
  }

  let summary: ReactNode;
  if (frameUrl && missing !== null) {
    summary = (
      <>
        <p className="small">
          טעינה של <span dir="ltr">{formatShekel(missing)}</span> לארנק. פרטי הכרטיס נקלטים בעמוד המאובטח של חברת
          הסליקה ולא נשמרים אצלנו.
        </p>
        <iframe
          className="payment-frame"
          src={frameUrl}
          title="תשלום מאובטח בכרטיס אשראי"
          allow="payment"
          referrerPolicy="origin"
        />
        <button className="btn btn-ghost btn-block" onClick={() => setFrameUrl(null)}>
          ביטול
        </button>
      </>
    );
  } else if (me && !me.verifiedAdult) {
    summary = (
      <>
        <div className="alert alert-info">לפני ההזמנה הראשונה יש להשלים את פרטי הפרופיל.</div>
        <ProfileForm onDone={() => void load(ticket)} />
      </>
    );
  } else if (calc && balance !== null && missing !== null) {
    summary = (
      <>
        <PriceSummary price={buildPriceDisplay(calc)} />
        <div className="perf" aria-hidden="true" />
        <div className="receipt-total">
          <span>לתשלום</span>
          <span dir="ltr">{formatShekel(calc.total)}</span>
        </div>
        <div className="spread small">
          <span>יתרה בארנק</span>
          <span dir="ltr">{formatShekel(balance)}</span>
        </div>
        {payAction}
      </>
    );
  } else if (error) {
    summary = (
      <button className="btn btn-ghost" onClick={() => void load(ticket)}>
        נסו שוב
      </button>
    );
  } else {
    summary = <p className="muted loading">טוען…</p>;
  }

  return (
    <div className="grid-2">
      <section className="card">
        <h2>הטופס</h2>
        <p>
          {TICKET_TYPE_LABELS[ticket.type]}
          {rule ? `, ${rule.label}` : ''}, {ticket.tables.length} טבלאות
          {ticket.extra ? ', עם אקסטרה' : ''}, {ticket.drawCount === 1 ? 'הגרלה אחת' : `${ticket.drawCount} הגרלות`}
        </p>
        <ol className="ticket-tables">
          {ticket.tables.map((t, i) => (
            <li key={i}>
              <Balls numbers={t.numbers} strong={t.strongNumbers} />
            </li>
          ))}
        </ol>
        <Link href="/ticket">עריכת הטופס</Link>
      </section>

      <section className="stub receipt">
        <h2>סיכום</h2>
        {error ? (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        ) : null}
        {summary}
      </section>
    </div>
  );
}
