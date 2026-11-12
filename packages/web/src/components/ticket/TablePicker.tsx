'use client';

import { LOTTO_NUMBER_MAX, LOTTO_STRONG_MAX } from '@lotto-maker/shared';
import type { TableState } from '@/lib/ticket-state';

interface Props {
  index: number;
  table: TableState;
  needNumbers: number;
  needStrong: number;
  onNumber: (n: number) => void;
  onStrong: (n: number) => void;
}

const NUMBERS = Array.from({ length: LOTTO_NUMBER_MAX }, (_, i) => i + 1);
const STRONG = Array.from({ length: LOTTO_STRONG_MAX }, (_, i) => i + 1);

/** 37-number grid plus the strong number (1-7) for one table. */
export function TablePicker({ index, table, needNumbers, needStrong, onNumber, onStrong }: Props) {
  const full = table.numbers.length >= needNumbers;
  return (
    <div className="stack">
      <div>
        <div className="small muted" id={`t${index}-n`}>
          בחרו {needNumbers} מספרים ({table.numbers.length}/{needNumbers})
        </div>
        <div className="picker" role="group" aria-labelledby={`t${index}-n`} dir="ltr">
          {NUMBERS.map((n) => {
            const on = table.numbers.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => onNumber(n)}
                aria-label={`מספר ${n}`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="small muted" id={`t${index}-s`}>
          {needStrong === 1 ? 'המספר החזק' : `בחרו ${needStrong} מספרים חזקים`}
        </div>
        <div className="strong-picker" role="group" aria-labelledby={`t${index}-s`} dir="ltr">
          {STRONG.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={table.strongNumbers.includes(n)}
              onClick={() => onStrong(n)}
              aria-label={`מספר חזק ${n}`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
