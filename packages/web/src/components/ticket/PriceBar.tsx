'use client';

import { useState, type ReactNode } from 'react';
import { ApiError, errorMessage } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import type { PriceDisplay, PriceListResult } from '@/lib/price';
import type { TicketState } from '@/lib/ticket-state';
import type { CalculateResponse, PricesResponse } from '@/lib/types';
import type { ApiState } from '@/lib/use-api';
import { PriceSummary } from './PriceSummary';

const PRICE_LIST_UNAVAILABLE = 'המחירון אינו זמין כרגע. נסו שוב מאוחר יותר.';

export interface PriceNoticeInput {
  storageError: string | null;
  priceError: string | null;
  /** The ticket priced from the public price list (null until it loads). */
  listPriced: PriceListResult | null;
  prices: ApiState<PricesResponse>;
  /** The backend's price for the complete ticket (logged in). */
  calc: CalculateResponse | null;
  price: PriceDisplay | null;
  complete: boolean;
  loadingPrice: boolean;
  filledCount: number;
  tableCount: number;
}

/** Problems with the public price list, shown until the backend has priced the ticket. */
function priceListNotice({ listPriced, prices }: PriceNoticeInput): ReactNode {
  if (listPriced?.ok === false) {
    return (
      <div className="alert alert-warn small">
        {listPriced.reason === 'EXTRA_NOT_AVAILABLE'
          ? errorMessage(new ApiError(422, 'EXTRA_NOT_AVAILABLE', ''))
          : PRICE_LIST_UNAVAILABLE}
      </div>
    );
  }
  if (prices.error) {
    return (
      <div className="alert alert-error small" role="alert">
        {`לא הצלחנו לטעון את המחירון. ${prices.error}`}{' '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={prices.reload}>
          נסו שוב
        </button>
      </div>
    );
  }
  if (prices.notAvailable) return <div className="alert alert-warn small">{PRICE_LIST_UNAVAILABLE}</div>;
  return null;
}

/** Progress while the price is not there yet. */
function progressNotice(input: PriceNoticeInput): ReactNode {
  const { price, prices, complete, loadingPrice } = input;
  if (!price && prices.loading) return <p className="muted small loading price-bar-note">טוען מחירון…</p>;
  if (!complete) {
    return (
      <p className="muted small price-bar-note">
        {input.filledCount}/{input.tableCount} טבלאות מלאות. השלימו או השתמשו בלוטומט.
      </p>
    );
  }
  if (loadingPrice && !price) return <p className="muted small loading price-bar-note">מחשב מחיר…</p>;
  return null;
}

/** The one line above the price bar: an error, a price-list problem, or progress. */
export function priceNotice(input: PriceNoticeInput): ReactNode {
  if (input.storageError) {
    return (
      <div className="alert alert-error small" role="alert">
        {input.storageError}
      </div>
    );
  }
  if (input.priceError) return <div className="alert alert-error small">{input.priceError}</div>;
  const listNotice = input.calc ? null : priceListNotice(input);
  return listNotice ?? progressNotice(input);
}

/** "2 טבלאות · הגרלה אחת · בלי אקסטרה" */
export function ticketSummary(state: TicketState): string {
  return [
    state.tables.length === 1 ? 'טבלה אחת' : `${state.tables.length} טבלאות`,
    state.drawCount === 1 ? 'הגרלה אחת' : `${state.drawCount} הגרלות`,
    state.extra ? 'עם אקסטרה' : 'בלי אקסטרה',
  ].join(' · ');
}

function PriceDetails({ price, calc }: Readonly<{ price: PriceDisplay; calc: CalculateResponse | null }>) {
  const firstDraw = calc?.draws[0];
  return (
    <>
      <div className="price-bar-details" id="price-bar-details">
        <PriceSummary price={price} hideWarning />
        {firstDraw ? (
          <p className="small muted" style={{ margin: '0 0 8px' }}>
            הגרלה {firstDraw.drawNumber}, {formatDateTime(firstDraw.drawAt)}. ההזמנה נסגרת{' '}
            {formatDateTime(firstDraw.orderCutoff)}.
          </p>
        ) : null}
      </div>
      {price.warning ? <div className="alert alert-warn small">{price.warning}</div> : null}
    </>
  );
}

interface Props {
  notice: PriceNoticeInput;
  summary: string;
  canContinue: boolean;
  onContinue: () => void;
  onFillRest: () => void;
}

/** Sticky bar: notice, price breakdown (collapsible on mobile), total and the main action. */
export function PriceBar({ notice, summary, canContinue, onContinue, onFillRest }: Readonly<Props>) {
  // Mobile only: the price breakdown is collapsed so the sticky bar stays one line high.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { price, priceError, complete, filledCount } = notice;
  return (
    <div className={`price-bar${detailsOpen ? ' details-open' : ''}`} aria-live="polite">
      {priceNotice(notice)}
      {price ? <PriceDetails price={price} calc={notice.calc} /> : null}
      <div className="price-bar-main">
        <div className="price-bar-sum">
          <span className="small muted price-bar-summary">{summary}</span>
          <div className="price-total">{price ? <span dir="ltr">{price.total}</span> : null}</div>
          {price && !priceError ? (
            <button
              type="button"
              className="price-bar-toggle"
              aria-expanded={detailsOpen}
              aria-controls="price-bar-details"
              onClick={() => setDetailsOpen((o) => !o)}
            >
              {detailsOpen ? 'הסתרת פירוט' : 'פירוט המחיר'}
            </button>
          ) : null}
        </div>
        {complete ? (
          <button type="button" className="btn" disabled={!canContinue} onClick={onContinue}>
            המשך לתשלום
          </button>
        ) : (
          <button type="button" className="btn btn-accent" onClick={onFillRest}>
            <span className="lottomat-icon" aria-hidden="true" />
            {filledCount === 0 ? 'לוטומט לכל הטבלאות' : 'השלמה בלוטומט'}
          </button>
        )}
      </div>
    </div>
  );
}
