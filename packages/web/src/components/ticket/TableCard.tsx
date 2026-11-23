'use client';

import type { ReactNode } from 'react';
import type { TableState } from '@/lib/ticket-state';
import { Balls } from '../Balls';
import { TablePicker } from './TablePicker';

interface Props {
  index: number;
  table: TableState;
  needNumbers: number;
  needStrong: number;
  complete: boolean;
  open: boolean;
  rolling: boolean;
  onToggleOpen: () => void;
  onNumber: (n: number) => void;
  onStrong: (n: number) => void;
  onLottomat: () => void;
  onClear: () => void;
}

/** One table: header with Lottomat / clear, and the picker when open (otherwise its balls). */
export function TableCard(props: Readonly<Props>) {
  const { index, table, complete, open, rolling } = props;
  const empty = table.numbers.length === 0 && table.strongNumbers.length === 0;
  let body: ReactNode;
  if (open) {
    body = (
      <TablePicker
        index={index}
        table={table}
        needNumbers={props.needNumbers}
        needStrong={props.needStrong}
        onNumber={props.onNumber}
        onStrong={props.onStrong}
      />
    );
  } else if (empty) {
    body = <span className="small muted">ריקה. לחצו לעריכה או השתמשו בלוטומט.</span>;
  } else {
    body = <Balls numbers={table.numbers} strong={table.strongNumbers} />;
  }
  return (
    <div className={`table-card${complete ? ' complete' : ''}${rolling ? ' rolling' : ''}`}>
      <div className="spread">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={open}
          onClick={props.onToggleOpen}
          style={{ border: 0, paddingInline: 4 }}
        >
          <span className="table-title">טבלה {index + 1}</span>
          {complete ? <span className="table-done">✓</span> : null}
        </button>
        <div className="row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={props.onLottomat}>
            <span className="lottomat-icon" aria-hidden="true" />
            {'לוטומט'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={props.onClear} disabled={empty}>
            ניקוי
          </button>
        </div>
      </div>
      {body}
    </div>
  );
}
