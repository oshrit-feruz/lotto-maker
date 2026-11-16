'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { MAX_DRAW_COUNT, TICKET_TYPE_LABELS, binomial, type TicketType } from '@lotto-maker/shared';
import { ApiError, api, errorMessage } from '@/lib/api-client';
import { loadDraft, saveDraft } from '@/lib/draft';
import { formatDateTime } from '@/lib/format';
import { buildPriceDisplay } from '@/lib/price';
import {
  cryptoRng,
  enabledSystematicRules,
  initialTicketState,
  isTableComplete,
  isTicketComplete,
  numbersPerTable,
  strongPerTable,
  tableCountOptions,
  ticketErrors,
  ticketReducer,
  toTicketInput,
} from '@/lib/ticket-state';
import type { CalculateResponse, DuplicateResponse } from '@/lib/types';
import { Balls } from '../Balls';
import { PriceSummary } from './PriceSummary';
import { TablePicker } from './TablePicker';

const ERROR_TEXT: Record<string, string> = {
  ODD_TABLE_COUNT: 'מספר הטבלאות חייב להיות זוגי.',
  INVALID_TABLE_COUNT: 'מספר הטבלאות אינו תקין לסוג הטופס.',
  INVALID_DRAW_COUNT: 'מספר ההגרלות אינו תקין.',
  DUPLICATE_NUMBERS: 'יש מספר כפול באחת הטבלאות.',
  SYSTEMATIC_TYPE_DISABLED: 'סוג השיטתי הזה אינו זמין כרגע.',
};

export function TicketForm() {
  const router = useRouter();
  const [state, dispatch] = useReducer(ticketReducer, undefined, initialTicketState);
  const [active, setActive] = useState(0);
  const [calc, setCalc] = useState<CalculateResponse | null>(null);
  const [dup, setDup] = useState<DuplicateResponse | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  // Mobile only: the price breakdown is collapsed so the sticky bar stays one line high.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const seq = useRef(0);
  // Visual only: which table(s) the Lottomat just filled, so the balls drop in.
  const [rolling, setRolling] = useState<{ target: number | 'all'; n: number } | null>(null);
  const rollSeq = useRef(0);

  // Coming back from checkout: restore the ticket.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) dispatch({ type: 'load', state: draft as never });
  }, []);

  const systematicRules = useMemo(() => enabledSystematicRules(), []);
  const needNumbers = numbersPerTable(state);
  const needStrong = strongPerTable(state);
  const complete = isTicketComplete(state);
  const errors = complete ? ticketErrors(state) : [];
  const requestKey = complete && errors.length === 0 ? JSON.stringify(toTicketInput(state)) : null;
  const filledCount = state.tables.filter((_, i) => isTableComplete(state, i)).length;

  // Live price and duplicate warning, debounced; stale answers are dropped.
  useEffect(() => {
    const mySeq = ++seq.current;
    if (!requestKey) {
      setCalc(null);
      setDup(null);
      setPriceError(null);
      setLoadingPrice(false);
      return;
    }
    setLoadingPrice(true);
    const timer = setTimeout(async () => {
      const body = JSON.parse(requestKey) as unknown;
      const [c, d] = await Promise.allSettled([
        api.post<CalculateResponse>('tickets/calculate', body),
        api.post<DuplicateResponse>('tickets/check-duplicate', body),
      ]);
      if (mySeq !== seq.current) return;
      setLoadingPrice(false);
      if (c.status === 'fulfilled') {
        setCalc(c.value);
        setPriceError(null);
      } else {
        setCalc(null);
        const err = c.reason;
        setPriceError(
          err instanceof ApiError && err.status === 401 ? 'יש להתחבר מחדש כדי לראות מחיר.' : errorMessage(err),
        );
      }
      setDup(d.status === 'fulfilled' ? d.value : null);
    }, 350);
    return () => clearTimeout(timer);
  }, [requestKey]);

  useEffect(() => {
    if (!rolling) return;
    const timer = setTimeout(() => setRolling(null), 1100);
    return () => clearTimeout(timer);
  }, [rolling]);

  function roll(target: number | 'all') {
    rollSeq.current += 1;
    setRolling({ target, n: rollSeq.current });
  }

  // Keep the open table inside the range when the count shrinks.
  useEffect(() => {
    if (active >= state.tables.length) setActive(Math.max(0, state.tables.length - 1));
  }, [active, state.tables.length]);

  const price = calc ? buildPriceDisplay(calc) : null;
  const canContinue = Boolean(requestKey && calc && calc.enoughDraws && !loadingPrice);

  function goToCheckout() {
    if (!canContinue) return;
    saveDraft(state);
    router.push('/checkout');
  }

  return (
    <div>
      <section className="card stack" aria-label="סוג הטופס">
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>
            סוג הטופס
          </div>
          <div className="segmented" role="group" aria-label="סוג הטופס">
            {(['regular', 'double'] as TicketType[]).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={state.type === t}
                onClick={() => dispatch({ type: 'setType', ticketType: t })}
              >
                {TICKET_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {systematicRules.length > 0 ? (
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="systematic">מילוי</label>
            <select
              id="systematic"
              value={state.systematicType ?? ''}
              onChange={(e) => {
                dispatch({ type: 'setSystematic', systematicType: e.target.value || null });
                setActive(0);
              }}
            >
              <option value="">טבלאות רגילות (6 מספרים)</option>
              {systematicRules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                  {r.kind === 'full' && r.numbersCount ? ` (${binomial(r.numbersCount, 6)} צירופים)` : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="grid-2">
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="tables">מספר טבלאות</label>
            <select
              id="tables"
              value={state.tables.length}
              disabled={tableCountOptions(state).length === 1}
              onChange={(e) => dispatch({ type: 'setTableCount', count: Number(e.target.value) })}
            >
              {tableCountOptions(state).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="draws">מספר הגרלות</label>
            <select
              id="draws"
              value={state.drawCount}
              onChange={(e) => dispatch({ type: 'setDrawCount', count: Number(e.target.value) })}
            >
              {Array.from({ length: MAX_DRAW_COUNT }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? 'הגרלה אחת' : `${n} הגרלות רצופות`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="row" style={{ fontWeight: 600, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={state.extra}
            onChange={(e) => dispatch({ type: 'setExtra', extra: e.target.checked })}
            style={{ width: 20, height: 20 }}
          />
          להוסיף אקסטרה
        </label>
      </section>

      <section aria-label="טבלאות">
        <div className="spread" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>
            טבלאות{' '}
            <span className="small muted">
              ({filledCount}/{state.tables.length} מלאות)
            </span>
          </h2>
          <button
            type="button"
            className={`btn btn-accent btn-sm lottomat-all${rolling?.target === 'all' ? ' rolling' : ''}`}
            onClick={() => {
              dispatch({ type: 'lottomatAll', rng: cryptoRng });
              roll('all');
            }}
          >
            <span className="lottomat-icon" aria-hidden="true" />
            לוטומט לכל הטבלאות
          </button>
        </div>

        {state.tables.map((table, i) => {
          const done = isTableComplete(state, i);
          const open = i === active;
          return (
            <div
              key={i}
              className={`table-card${done ? ' complete' : ''}${
                rolling && (rolling.target === 'all' || rolling.target === i) ? ' rolling' : ''
              }`}
            >
              <div className="spread">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  aria-expanded={open}
                  onClick={() => setActive(open ? -1 : i)}
                  style={{ border: 0, paddingInline: 4 }}
                >
                  <span className="table-title">טבלה {i + 1}</span>
                  {done ? <span className="table-done">✓</span> : null}
                </button>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      dispatch({ type: 'lottomatTable', table: i, rng: cryptoRng });
                      roll(i);
                    }}
                  >
                    <span className="lottomat-icon" aria-hidden="true" />
                    לוטומט
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => dispatch({ type: 'clearTable', table: i })}
                    disabled={table.numbers.length === 0 && table.strongNumbers.length === 0}
                  >
                    ניקוי
                  </button>
                </div>
              </div>
              {open ? (
                <TablePicker
                  index={i}
                  table={table}
                  needNumbers={needNumbers}
                  needStrong={needStrong}
                  onNumber={(n) => dispatch({ type: 'toggleNumber', table: i, number: n })}
                  onStrong={(n) => dispatch({ type: 'toggleStrong', table: i, number: n })}
                />
              ) : table.numbers.length > 0 || table.strongNumbers.length > 0 ? (
                <Balls numbers={table.numbers} strong={table.strongNumbers} />
              ) : (
                <span className="small muted">ריקה. לחצו לעריכה או השתמשו בלוטומט.</span>
              )}
            </div>
          );
        })}
      </section>

      {errors.length > 0 ? (
        <div className="alert alert-error" role="alert">
          {ERROR_TEXT[errors[0]!.code] ?? 'הטופס אינו תקין.'}
        </div>
      ) : null}

      {dup?.duplicate ? (
        <div className="alert alert-warn" role="status">
          שימו לב: כבר יש לכם טופס זהה בהגרלה {dup.drawNumbers.join(', ')}. אפשר להמשיך, אם זה מכוון.
        </div>
      ) : null}

      <div className={`price-bar${detailsOpen ? ' details-open' : ''}`} aria-live="polite">
        {!complete ? (
          <p className="muted small price-bar-note">מלאו את כל הטבלאות כדי לראות מחיר.</p>
        ) : loadingPrice ? (
          <p className="muted small loading price-bar-note">מחשב מחיר…</p>
        ) : priceError ? (
          <div className="alert alert-error small">{priceError}</div>
        ) : price ? (
          <>
            <div className="price-bar-details" id="price-bar-details">
              <PriceSummary price={price} hideWarning />
              {calc && calc.draws[0] ? (
                <p className="small muted" style={{ margin: '0 0 8px' }}>
                  הגרלה {calc.draws[0].drawNumber}, {formatDateTime(calc.draws[0].drawAt)}. ההזמנה נסגרת{' '}
                  {formatDateTime(calc.draws[0].orderCutoff)}.
                </p>
              ) : null}
            </div>
            {price.warning ? <div className="alert alert-warn small">{price.warning}</div> : null}
          </>
        ) : null}
        <div className="price-bar-main">
          <div className="price-bar-sum">
            <div className="price-total">{price ? <span dir="ltr">{price.total}</span> : null}</div>
            {price && !priceError && !loadingPrice ? (
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
          <button type="button" className="btn" disabled={!canContinue} onClick={goToCheckout}>
            המשך לתשלום
          </button>
        </div>
      </div>
    </div>
  );
}
