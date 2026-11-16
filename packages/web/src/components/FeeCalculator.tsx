'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { MAX_DRAW_COUNT, TICKET_TYPE_LABELS, type TicketType } from '@lotto-maker/shared';
import { buildPriceDisplay, priceFromList, type PriceDisplay } from '@/lib/price';
import {
  enabledSystematicRules,
  initialTicketState,
  ticketReducer,
  toTicketInput,
  type Rng,
} from '@/lib/ticket-state';
import type { PricesResponse } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { PriceSummary } from './ticket/PriceSummary';

// The price does not depend on the numbers, so a fixed sequence fills the sample ticket.
const sequentialRng: Rng = () => 0;

function tableOptionsFor(type: TicketType, systematic: string): number[] {
  if (systematic) return [1];
  return type === 'regular' ? [2, 4, 6, 8, 10, 12, 14] : [2, 4, 6, 8, 10];
}

/**
 * Prices a sample ticket from the public price list (GET /prices), so it works
 * logged out. Same formula as the backend; the order is priced again on submit.
 */
export function FeeCalculator() {
  const [type, setType] = useState<TicketType>('regular');
  const [systematic, setSystematic] = useState<string>('');
  const [tables, setTables] = useState(2);
  const [extra, setExtra] = useState(false);
  const [draws, setDraws] = useState(1);
  const prices = useApi<PricesResponse>('prices');

  let state = ticketReducer(initialTicketState(), { type: 'setType', ticketType: type });
  state = ticketReducer(state, { type: 'setSystematic', systematicType: systematic || null });
  state = ticketReducer(state, { type: 'setTableCount', count: tables });
  state = ticketReducer(state, { type: 'setExtra', extra });
  state = ticketReducer(state, { type: 'setDrawCount', count: draws });
  state = ticketReducer(state, { type: 'lottomatAll', rng: sequentialRng });
  const tableOptions = tableOptionsFor(type, systematic);

  const priced = prices.data ? priceFromList(prices.data, toTicketInput(state)) : null;
  const price: PriceDisplay | null = priced?.ok ? buildPriceDisplay(priced.calc) : null;
  let unavailable: string | null = null;
  if (priced?.ok === false && priced.reason === 'EXTRA_NOT_AVAILABLE') {
    unavailable = `אקסטרה אינו זמין ב${TICKET_TYPE_LABELS[type]}.`;
  } else if (prices.notAvailable || priced?.ok === false) {
    unavailable = 'המחירון אינו זמין כרגע. נסו שוב מאוחר יותר.';
  }

  let priceBody: ReactNode;
  if (prices.error) {
    priceBody = (
      <div className="alert alert-error">
        {prices.error}{' '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={prices.reload}>
          נסו שוב
        </button>
      </div>
    );
  } else if (unavailable) {
    priceBody = <div className="alert alert-warn">{unavailable}</div>;
  } else if (price) {
    priceBody = (
      <>
        <PriceSummary price={price} />
        <div className="spread price-total">
          <span>סה״כ</span>
          <span dir="ltr">{price.total}</span>
        </div>
        <p className="small muted">
          לפי המחירון העדכני. המחיר הסופי מחושב שוב בעת ההזמנה. <Link href="/ticket">למילוי טופס</Link>
        </p>
      </>
    );
  } else {
    priceBody = <p className="muted">מחשב…</p>;
  }

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
          {'אקסטרה'}
        </label>
      </section>
      <section className="card" aria-live="polite">
        <h2>המחיר</h2>
        {priceBody}
      </section>
    </div>
  );
}
