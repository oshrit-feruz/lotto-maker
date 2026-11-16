import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listAudit } from '../api/audit';
import type { AuditEntry } from '../api/types';
import { Empty, Pager, QueryState } from '../components/ui';
import { formatDate, formatDayInput } from '../lib/format';
import { ACTOR_TYPE_LABEL, ENTITY_LABEL, auditActionLabel, labelOf } from '../lib/labels';
import { formatPhoneLocal } from '../lib/phone';

const PAGE_SIZE = 50;

/**
 * Who did it: the admin's name, else their phone (local form), when an admin acted; else the actor
 * type in Hebrew and the end of the actor's id.
 */
export function actorLabel(e: Pick<AuditEntry, 'actorType' | 'actorId' | 'adminName' | 'adminPhone'>): string {
  if (e.actorType === 'admin' && (e.adminName || e.adminPhone)) {
    return e.adminName || formatPhoneLocal(e.adminPhone);
  }
  if (!e.actorType) return '—';
  const type = labelOf(ACTOR_TYPE_LABEL, e.actorType);
  return e.actorId && e.actorType !== 'system' ? `${type} ${e.actorId.slice(-6)}` : type;
}

/** A date filter: the native picker (localized where the browser allows) plus the value as dd/mm/yyyy. */
function DateFilter({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      {label}
      <span className="date-field">
        <input type="date" lang="he-IL" value={value} onChange={(e) => onChange(e.target.value)} />
        <output aria-live="polite">{formatDayInput(value) || 'dd/mm/yyyy'}</output>
      </span>
    </label>
  );
}

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['audit', action, from, to, page],
    // Bare dates: the backend reads them as whole days in Israel time.
    queryFn: () =>
      listAudit({
        page,
        pageSize: PAGE_SIZE,
        ...(action.trim() ? { action: action.trim() } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      }),
    placeholderData: keepPreviousData,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <>
      <h1>יומן ביקורת</h1>
      <div className="row">
        <label>
          פעולה (תחילית)
          <input value={action} onChange={(e) => reset(setAction)(e.target.value)} dir="ltr" placeholder="user: / draw:results" />
        </label>
        <DateFilter label="מתאריך" value={from} onChange={reset(setFrom)} />
        <DateFilter label="עד תאריך" value={to} onChange={reset(setTo)} />
      </div>
      <QueryState q={q}>
        {(data) =>
          data.items.length === 0 ? (
            <Empty />
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>זמן</th>
                    <th>פעולה</th>
                    <th>ישות</th>
                    <th>מבצע</th>
                    <th>פרטים</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((e) => (
                    <tr key={e.id}>
                      <td>{formatDate(e.createdAt)}</td>
                      <td title={e.action}>{auditActionLabel(e.action)}</td>
                      <td>
                        {labelOf(ENTITY_LABEL, e.entityType)} <span className="ltr muted">{e.entityId.slice(-8)}</span>
                        {e.orderId && e.orderId !== e.entityId && (
                          <>
                            {' '}
                            · הזמנה <span className="ltr muted">{e.orderId.slice(-8)}</span>
                          </>
                        )}
                      </td>
                      <td>{actorLabel(e)}</td>
                      <td className="ltr">{e.metadata ? JSON.stringify(e.metadata) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} disabled={q.isFetching} />
            </>
          )
        }
      </QueryState>
    </>
  );
}
