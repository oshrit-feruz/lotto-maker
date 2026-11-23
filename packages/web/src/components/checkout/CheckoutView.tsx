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
import { completeTicketFrom, toTicketInput, type TicketState } from '@/lib/ticket-state';
import type { CalculateResponse, CheckoutResponse, CreateOrderResponse, Me } from '@/lib/types';
import { Balls } from '../Balls';
import { ProfileForm } from '../ProfileForm';
import { PriceSummary } from '../ticket/PriceSummary';
import { OrderPlaced } from './OrderPlaced';

/** The stored ticket plus its price, the profile and the wallet balance. */
function useCheckoutData() {
  const [ticket, setTicket] = useState<TicketState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [calc, setCalc] = useState<CalculateResponse | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const usable = completeTicketFrom(loadDraft());
    setTicket(usable);
    setLoaded(true);
    if (usable) void load(usable);
  }, [load]);

  return { ticket, loaded, calc, me, balance, error, setError, load };
}

/** Pay from the wallet, or top it up first on the provider's card page (iframe for Hyp, redirect otherwise). */
function useCheckoutPayment(
  ticket: TicketState | null,
  calc: CalculateResponse | null,
  missing: number | null,
  setError: (e: string | null) => void,
) {
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<CreateOrderResponse | null>(null);
  // The provider's hosted card page, shown in an iframe here (Hyp); the mock is a full redirect
  const [frameUrl, setFrameUrl] = useState<string | null>(null);

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

  return { busy, placed, frameUrl, closeFrame: () => setFrameUrl(null), payFromWallet, topUp };
}

function EmptyCheckout() {
  return (
    <div className="card empty">
      <p>אין טופס לתשלום.</p>
      <Link className="btn" href="/ticket">
        למילוי טופס
      </Link>
    </div>
  );
}

function TicketCard({ ticket }: Readonly<{ ticket: TicketState }>) {
  const rule = ticket.systematicType ? getSystematicRule(ticket.systematicType) : null;
  return (
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
  );
}

function PayAction({
  missing,
  busy,
  onPay,
  onTopUp,
}: Readonly<{ missing: number; busy: boolean; onPay: () => void; onTopUp: () => void }>) {
  if (missing === 0) {
    return (
      <button className="btn btn-block" style={{ marginTop: 12 }} onClick={onPay} disabled={busy}>
        {busy ? 'מבצע הזמנה…' : 'תשלום מהארנק'}
      </button>
    );
  }
  return (
    <>
      <p className="small" style={{ marginTop: 12 }}>
        חסרים <span dir="ltr">{formatShekel(missing)}</span> בארנק. נטען את הסכום בכרטיס אשראי בעמוד תשלום
        מאובטח, ואז ההזמנה תבוצע מהארנק.
      </p>
      <button className="btn btn-block" onClick={onTopUp} disabled={busy}>
        {busy ? 'מעביר לתשלום…' : `טעינה של ${formatShekel(missing)} ותשלום`}
      </button>
    </>
  );
}

function PaymentFrame({ url, missing, onCancel }: Readonly<{ url: string; missing: number; onCancel: () => void }>) {
  return (
    <>
      <p className="small">
        טעינה של <span dir="ltr">{formatShekel(missing)}</span> לארנק. פרטי הכרטיס נקלטים בעמוד המאובטח של חברת
        הסליקה ולא נשמרים אצלנו.
      </p>
      <iframe
        className="payment-frame"
        src={url}
        title="תשלום מאובטח בכרטיס אשראי"
        allow="payment"
        referrerPolicy="origin"
      />
      <button className="btn btn-ghost btn-block" onClick={onCancel}>
        ביטול
      </button>
    </>
  );
}

function Receipt({
  calc,
  balance,
  payAction,
}: Readonly<{ calc: CalculateResponse; balance: string; payAction: ReactNode }>) {
  return (
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
}

export function CheckoutView() {
  const { ticket, loaded, calc, me, balance, error, setError, load } = useCheckoutData();
  const missing = calc && balance !== null ? topUpAmount(calc.total, balance) : null;
  const pay = useCheckoutPayment(ticket, calc, missing, setError);

  if (pay.placed) return <OrderPlaced result={pay.placed} />;
  if (!loaded) return <p className="muted loading">טוען…</p>;
  if (!ticket) return <EmptyCheckout />;

  const payAction =
    calc?.enoughDraws && missing !== null ? (
      <PayAction missing={missing} busy={pay.busy} onPay={pay.payFromWallet} onTopUp={pay.topUp} />
    ) : null;

  let summary: ReactNode;
  if (pay.frameUrl && missing !== null) {
    summary = <PaymentFrame url={pay.frameUrl} missing={missing} onCancel={pay.closeFrame} />;
  } else if (me && !me.verifiedAdult) {
    summary = (
      <>
        <div className="alert alert-info">לפני ההזמנה הראשונה יש להשלים את פרטי הפרופיל.</div>
        <ProfileForm onDone={() => void load(ticket)} />
      </>
    );
  } else if (calc && balance !== null && missing !== null) {
    summary = <Receipt calc={calc} balance={balance} payAction={payAction} />;
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
      <TicketCard ticket={ticket} />

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
