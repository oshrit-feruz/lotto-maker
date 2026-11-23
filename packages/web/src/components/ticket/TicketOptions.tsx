'use client';

import { useMemo, type Dispatch } from 'react';
import { MAX_DRAW_COUNT, TICKET_TYPE_LABELS, binomial, type TicketType } from '@lotto-maker/shared';
import { enabledSystematicRules, tableCountOptions, type TicketAction, type TicketState } from '@/lib/ticket-state';

const TICKET_TYPES: TicketType[] = ['regular', 'double'];
const DRAW_COUNTS = Array.from({ length: MAX_DRAW_COUNT }, (_, i) => i + 1);

interface Props {
  state: TicketState;
  dispatch: Dispatch<TicketAction>;
  /** Called after the systematic type changes (the tables start over). */
  onSystematicChange: () => void;
}

/** Ticket type, systematic fill, table and draw counts, Extra. */
export function TicketOptions({ state, dispatch, onSystematicChange }: Readonly<Props>) {
  const systematicRules = useMemo(() => enabledSystematicRules(), []);
  const tableCounts = tableCountOptions(state);
  return (
    <section className="card stack" aria-label="סוג הטופס">
      <div>
        <div className="small muted" style={{ marginBottom: 4 }}>
          סוג הטופס
        </div>
        <div className="segmented" role="group" aria-label="סוג הטופס">
          {TICKET_TYPES.map((t) => (
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
              onSystematicChange();
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
            disabled={tableCounts.length === 1}
            onChange={(e) => dispatch({ type: 'setTableCount', count: Number(e.target.value) })}
          >
            {tableCounts.map((n) => (
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
            {DRAW_COUNTS.map((n) => (
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
        {'להוסיף אקסטרה'}
      </label>
    </section>
  );
}
