import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listAudit } from '../api/audit';
import type { AuditEntry } from '../api/types';
import { Empty, Pager, QueryState } from '../components/ui';
import { formatDate } from '../lib/format';

const PAGE_SIZE = 50;

/** Who did it: the admin's name / phone when an admin acted, else the actor type and id. */
export function actorLabel(e: Pick<AuditEntry, 'actorType' | 'actorId' | 'adminName' | 'adminPhone'>): string {
  if (e.actorType === 'admin' && (e.adminName || e.adminPhone)) {
    return [e.adminName, e.adminPhone].filter(Boolean).join(' · ');
  }
  return `${e.actorType ?? '—'}${e.actorId ? `:${e.actorId.slice(-6)}` : ''}`;
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
        <label>
          מתאריך
          <input type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
        </label>
        <label>
          עד תאריך
          <input type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} />
        </label>
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
                      <td className="ltr">{e.action}</td>
                      <td className="ltr">
                        {e.entityType}:{e.entityId.slice(-8)}
                        {e.orderId && e.orderId !== e.entityId ? ` (order:${e.orderId.slice(-8)})` : ''}
                      </td>
                      <td className="ltr">{actorLabel(e)}</td>
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
