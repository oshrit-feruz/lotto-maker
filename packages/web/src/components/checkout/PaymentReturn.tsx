'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { clearDraft, clearPendingPayment, loadDraft, loadPendingPayment } from '@/lib/draft';
import { formatShekel } from '@/lib/format';
import { hostedResultParams, returnedPaymentId } from '@/lib/hosted-payment';
import { placeOrder } from '@/lib/orders';
import { isTicketComplete, sanitize } from '@/lib/ticket-state';
import type { CreateOrderResponse, PaymentView } from '@/lib/types';
import { OrderPlaced } from './OrderPlaced';

const POLL_MS = 2000;
const POLL_LIMIT = 45; // about 90 seconds

type Phase = 'checking' | 'approved' | 'ordering' | 'done' | 'failed' | 'timeout' | 'missing' | 'error';

/**
 * Landing page after the hosted payment page. Polls GET /payments/:id until the
 * provider's webhook has credited the wallet; on /payment/success it then
 * places the stored ticket as an order (POST /orders).
 */
export function PaymentReturn({ mode }: Readonly<{ mode: 'success' | 'canceled' }>) {
  const params = useSearchParams();
  const [phase, setPhase] = useState<Phase>('checking');
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [order, setOrder] = useState<CreateOrderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempts = useRef(0);
  const ordering = useRef(false);
  const verified = useRef(false);

  // The backend adds ?paymentId=<id> to the return URLs (Hyp also sends it back as uniqueID);
  // sessionStorage is the fallback (e.g. a provider that drops the query string).
  const paymentId = returnedPaymentId(params) ?? loadPendingPayment()?.paymentId ?? null;

  const finishOrder = useCallback(async () => {
    if (ordering.current) return;
    ordering.current = true;
    const draft = loadDraft();
    const ticket = draft ? sanitize(draft) : null;
    clearPendingPayment();
    if (!ticket || !isTicketComplete(ticket)) {
      setPhase('approved');
      return;
    }
    setPhase('ordering');
    // The draft stays until the order succeeds: placeOrder sends the ticket's Idempotency-Key, so a
    // reload here repeats the same request and gets the original order back (`replayed: true`)
    // instead of a second charge.
    try {
      const result = await placeOrder(ticket);
      clearDraft();
      setOrder(result);
      setPhase('done');
    } catch (err) {
      // Allow "try again" from this page after a failure.
      ordering.current = false;
      setError(errorMessage(err));
      setPhase('error');
    }
  }, []);

  const check = useCallback(async () => {
    if (!paymentId) {
      setPhase('missing');
      return;
    }
    try {
      const p = await api.get<PaymentView>(`payments/${encodeURIComponent(paymentId)}`);
      setPayment(p);
      if (p.status === 'approved') {
        if (mode === 'success') await finishOrder();
        else setPhase('approved');
        return;
      }
      if (p.status === 'failed' || p.status === 'refunded') {
        clearPendingPayment();
        setPhase('failed');
        return;
      }
      // Still pending: on the canceled page one check is enough.
      if (mode === 'canceled') {
        clearPendingPayment();
        setPhase('failed');
        return;
      }
      attempts.current += 1;
      if (attempts.current >= POLL_LIMIT) setPhase('timeout');
      else setTimeout(() => void check(), POLL_MS);
    } catch (err) {
      setError(errorMessage(err));
      setPhase('error');
    }
  }, [paymentId, mode, finishOrder]);

  useEffect(() => {
    // The hosted page ran in an iframe on the checkout page. If it sent only the frame here,
    // move the whole window (same origin) so the result is not shown inside the old page.
    if (window.top && window.top !== window.self) {
      window.top.location.href = window.location.href;
      return;
    }
    const result = hostedResultParams(params);
    if (!result || verified.current) {
      void check();
      return;
    }
    verified.current = true;
    // Hand the hosted page's result to the backend, which verifies it with the gateway and
    // credits the wallet; then poll as usual. A failure here is not final: a webhook may still land.
    api
      .post('payments/return', result)
      .catch(() => undefined)
      .finally(() => void check());
  }, []);

  if (phase === 'done' && order) return <OrderPlaced result={order} />;

  return (
    <div className="card" aria-live="polite">
      {phase === 'checking' || phase === 'ordering' ? (
        <p>{phase === 'checking' ? 'בודקים את סטטוס התשלום…' : 'התשלום אושר. מבצעים את ההזמנה…'}</p>
      ) : null}

      {phase === 'approved' ? (
        <>
          <div className="alert alert-ok">
            התשלום אושר והארנק נטען{payment ? <> ב־<span dir="ltr">{formatShekel(payment.amount)}</span></> : null}.
          </div>
          <div className="row">
            <Link className="btn" href="/checkout">
              להשלמת ההזמנה
            </Link>
            <Link className="btn btn-ghost" href="/account/wallet">
              לארנק
            </Link>
          </div>
        </>
      ) : null}

      {phase === 'failed' ? (
        <>
          <div className="alert alert-warn">
            {mode === 'canceled' ? 'התשלום בוטל. לא בוצע חיוב.' : 'התשלום לא אושר. לא בוצע חיוב.'}
          </div>
          <Link className="btn" href="/checkout">
            חזרה לתשלום
          </Link>
        </>
      ) : null}

      {phase === 'timeout' ? (
        <>
          <div className="alert alert-warn">
            אישור התשלום מתעכב. אם חויבתם, הסכום ייטען לארנק ברגע שחברת הסליקה תאשר.
          </div>
          <button
            className="btn"
            onClick={() => {
              attempts.current = 0;
              setPhase('checking');
              void check();
            }}
          >
            בדיקה חוזרת
          </button>
        </>
      ) : null}

      {phase === 'missing' ? (
        <>
          <p>לא נמצא תשלום לבדיקה.</p>
          <Link className="btn" href="/account/wallet">
            לארנק
          </Link>
        </>
      ) : null}

      {phase === 'error' ? (
        <>
          <div className="alert alert-error" role="alert">
            {error}
          </div>
          <p className="small muted">אם התשלום אושר, הסכום נמצא בארנק ואפשר להשלים את ההזמנה משם.</p>
          <div className="row">
            {mode === 'success' && payment?.status === 'approved' ? (
              <button className="btn" onClick={() => void finishOrder()}>
                ניסיון חוזר להזמנה
              </button>
            ) : null}
            <Link className={mode === 'success' && payment?.status === 'approved' ? 'btn btn-ghost' : 'btn'} href="/ticket">
              לטופס
            </Link>
            <Link className="btn btn-ghost" href="/account/wallet">
              לארנק
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
