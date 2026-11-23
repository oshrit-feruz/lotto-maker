'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { buildPriceDisplay, listPriceFor } from '@/lib/price';
import {
  cryptoRng,
  isTableComplete,
  isTicketComplete,
  numbersPerTable,
  strongPerTable,
  ticketErrors,
  toTicketInput,
} from '@/lib/ticket-state';
import type { PricesResponse } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { LoginDialog } from './LoginDialog';
import { PriceBar, ticketSummary } from './PriceBar';
import { TableCard } from './TableCard';
import { TicketOptions } from './TicketOptions';
import { useCheckoutGate, useDraftTicket, useLivePrice, useRolling, useSession } from './ticket-form-hooks';

const ERROR_TEXT: Record<string, string> = {
  ODD_TABLE_COUNT: 'מספר הטבלאות חייב להיות זוגי.',
  INVALID_TABLE_COUNT: 'מספר הטבלאות אינו תקין לסוג הטופס.',
  INVALID_DRAW_COUNT: 'מספר ההגרלות אינו תקין.',
  DUPLICATE_NUMBERS: 'יש מספר כפול באחת הטבלאות.',
  SYSTEMATIC_TYPE_DISABLED: 'סוג השיטתי הזה אינו זמין כרגע.',
};

export function TicketForm() {
  const router = useRouter();
  const [state, dispatch] = useDraftTicket();
  const [active, setActive] = useState(0);
  const { rolling, roll } = useRolling();
  const [authenticated, setAuthenticated] = useSession(router);
  const prices = useApi<PricesResponse>('prices');

  const needNumbers = numbersPerTable(state);
  const needStrong = strongPerTable(state);
  const complete = isTicketComplete(state);
  const errors = complete ? ticketErrors(state) : [];
  const loggedIn = authenticated === true;
  const ready = complete && errors.length === 0;
  const requestKey = loggedIn && ready ? JSON.stringify(toTicketInput(state)) : null;
  const filledCount = state.tables.filter((_, i) => isTableComplete(state, i)).length;
  const { calc, dup, priceError, loadingPrice } = useLivePrice(requestKey);

  // Keep the open table inside the range when the count shrinks.
  useEffect(() => {
    if (active >= state.tables.length) setActive(Math.max(0, state.tables.length - 1));
  }, [active, state.tables.length]);

  // Until the backend prices the complete ticket (logged in), the public price list gives the total.
  const listPriced = prices.data ? listPriceFor(prices.data, state) : null;
  const listPrice = listPriced?.ok ? buildPriceDisplay(listPriced.calc) : null;
  const price = calc ? buildPriceDisplay(calc) : listPrice;
  const canContinue = loggedIn
    ? Boolean(requestKey && calc?.enoughDraws && !loadingPrice)
    : authenticated === false && ready && listPrice !== null;

  const gate = useCheckoutGate({ router, state, canContinue, loggedIn, setAuthenticated });

  function lottomatAll() {
    dispatch({ type: 'lottomatAll', rng: cryptoRng });
    roll('all');
  }

  function fillRest() {
    dispatch({ type: 'lottomatRest', rng: cryptoRng });
    roll('all');
  }

  return (
    <div>
      <TicketOptions state={state} dispatch={dispatch} onSystematicChange={() => setActive(0)} />

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
            onClick={lottomatAll}
          >
            <span className="lottomat-icon" aria-hidden="true" />
            {'לוטומט לכל הטבלאות'}
          </button>
        </div>

        {state.tables.map((table, i) => {
          const open = i === active;
          return (
            <TableCard
              key={i}
              index={i}
              table={table}
              needNumbers={needNumbers}
              needStrong={needStrong}
              complete={isTableComplete(state, i)}
              open={open}
              rolling={Boolean(rolling && (rolling.target === 'all' || rolling.target === i))}
              onToggleOpen={() => setActive(open ? -1 : i)}
              onNumber={(n) => dispatch({ type: 'toggleNumber', table: i, number: n })}
              onStrong={(n) => dispatch({ type: 'toggleStrong', table: i, number: n })}
              onLottomat={() => {
                dispatch({ type: 'lottomatTable', table: i, rng: cryptoRng });
                roll(i);
              }}
              onClear={() => dispatch({ type: 'clearTable', table: i })}
            />
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

      <PriceBar
        notice={{
          storageError: gate.storageError,
          priceError,
          listPriced,
          prices,
          calc,
          price,
          complete,
          loadingPrice,
          filledCount,
          tableCount: state.tables.length,
        }}
        summary={ticketSummary(state)}
        canContinue={canContinue}
        onContinue={gate.goToCheckout}
        onFillRest={fillRest}
      />

      <LoginDialog open={gate.loginOpen} onClose={gate.closeLogin} onVerified={gate.onLoggedIn} />
    </div>
  );
}
