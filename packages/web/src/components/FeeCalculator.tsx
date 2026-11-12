'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MAX_DRAW_COUNT, TICKET_TYPE_LABELS, type TicketType } from '@lotto-maker/shared';
import { ApiError, api, errorMessage } from '@/lib/api-client';
import { buildPriceDisplay, type PriceDisplay } from '@/lib/price';
import {
  enabledSystematicRules,
  initialTicketState,
  ticketReducer,
  toTicketInput,
  type Rng,
} from '@/lib/ticket-state';
import type { CalculateResponse } from '@/lib/types';
import { PriceSummary } from './ticket/PriceSummary';

// The price does not depend on the numbers, so a fixed sequence fills the sample ticket.
const sequentialRng: Rng = () => 0;

/**
 * Prices a sample ticket with POST /tickets/calculate, the same call the order
 * uses. That route needs a session, so logged-out visitors are asked to log in.
 */
export function FeeCalculator() {
  const [type, setType] = useState<TicketType>('regular');
  const [systematic, setSystematic] = useState<string>('');
  const [tables, setTables] = useState(2);
  const [extra, setExtra] = useState(false);
  const [draws, setDraws] = useState(1);
  const [price, setPrice] = useState<PriceDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  let state = ticketReducer(initialTicketState(), { type: 'setType', ticketType: type });
  state = ticketReducer(state, { type: 'setSystematic', systematicType: systematic || null });
  state = ticketReducer(state, { type: 'setTableCount', count: tables });
  state = ticketReducer(state, { type: 'setExtra', extra });
  state = ticketReducer(state, { type: 'setDrawCount', count: draws });
  state = ticketReducer(state, { type: 'lottomatAll', rng: sequentialRng });
  const key = JSON.stringify(toTicketInput(state));
  const tableOptions = systematic ? [1] : type === 'regular' ? [2, 4, 6, 8, 10, 12, 14] : [2, 4, 6, 8, 10];

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api
        .post<CalculateResponse>('tickets/calculate', JSON.parse(key))
        .then((c) => {
          if (!alive) return;
          setPrice(buildPriceDisplay(c));
          setError(null);
          setNeedLogin(false);
        })
        .catch((err: unknown) => {
          if (!alive) return;
          setPrice(null);
          if (err instanceof ApiError && err.status === 401) setNeedLogin(true);
          else setError(errorMessage(err));
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key]);

  return (
    <div className="grid-2">
      <section className="card">
        <div className="field">
          <label htmlFor="f-type">סוג</label>
          <select
            id="f-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as TicketType);
              setTables(2);
            }}
          >
            {(['regular', 'double'] as TicketType[]).map((t) => (
              <option key={t} value={t}>
                {TICKET_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-sys">מילוי</label>
          <select id="f-sys" value={systematic} onChange={(e) => setSystematic(e.target.value)}>
            <option value="">טבלאות רגילות</option>
            {enabledSystematicRules().map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-tables">טבלאות</label>
          <select
            id="f-tables"
            value={state.tables.length}
            disabled={tableOptions.length === 1}
            onChange={(e) => setTables(Number(e.target.value))}
          >
            {tableOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-draws">הגרלות</label>
          <select id="f-draws" value={draws} onChange={(e) => setDraws(Number(e.target.value))}>
            {Array.from({ length: MAX_DRAW_COUNT }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={extra} onChange={(e) => setExtra(e.target.checked)} style={{ width: 20, height: 20 }} />
          אקסטרה
        </label>
      </section>
      <section className="card" aria-live="polite">
        <h2>המחיר</h2>
        {needLogin ? (
          <p>
            המחיר מחושב לפי מחירון עדכני מהשרת. <Link href="/login?next=/fees">התחברו</Link> כדי לראות את המחיר המדויק.
          </p>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : price ? (
          <>
            <PriceSummary price={price} />
            <div className="spread price-total">
              <span>סה״כ</span>
              <span dir="ltr">{price.total}</span>
            </div>
          </>
        ) : (
          <p className="muted">מחשב…</p>
        )}
      </section>
    </div>
  );
}
