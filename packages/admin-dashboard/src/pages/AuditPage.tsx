import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAudit } from '../api/audit';
import { Empty, QueryState } from '../components/ui';
import { formatDate, jerusalemDayToIso } from '../lib/format';

const PAGE_SIZE = 50;

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['audit', action, from, to, page],
    queryFn: () =>
      listAudit({
        page,
        pageSize: PAGE_SIZE,
        ...(action ? { action } : {}),
        ...(from ? { from: jerusalemDayToIso(from) } : {}),
        ...(to ? { to: jerusalemDayToIso(to, true) } : {}),
      }),
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
          פעולה
          <input value={action} onChange={(e) => reset(setAction)(e.target.value)} dir="ltr" placeholder="draw:results_confirmed" />
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
                      </td>
                      <td className="ltr">
                        {e.actorType ?? '—'}
                        {e.actorId ? `:${e.actorId.slice(-6)}` : ''}
                      </td>
                      <td className="ltr">{e.metadata ? JSON.stringify(e.metadata) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="row" style={{ marginTop: 12 }}>
                <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  הקודם
                </button>
                <span>
                  עמוד {page} מתוך {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}
                </span>
                <button className="secondary" disabled={page * PAGE_SIZE >= data.total} onClick={() => setPage(page + 1)}>
                  הבא
                </button>
              </div>
            </>
          )
        }
      </QueryState>
    </>
  );
}
