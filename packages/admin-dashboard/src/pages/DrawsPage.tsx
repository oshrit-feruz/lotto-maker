import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listDraws } from '../api/draws';
import type { DrawStatus } from '../api/types';
import { Badge, Empty, QueryState } from '../components/ui';
import { formatDate } from '../lib/format';

export const DRAW_STATUS_LABEL: Record<DrawStatus, string> = {
  scheduled: 'מתוזמנת',
  results_suggested: 'תוצאות מוצעות',
  results_confirmed: 'תוצאות אושרו',
  settled: 'שולמה',
};

export default function DrawsPage() {
  const [status, setStatus] = useState<DrawStatus | ''>('');
  const q = useQuery({ queryKey: ['draws', status], queryFn: () => listDraws(status || undefined) });

  return (
    <>
      <h1>הגרלות</h1>
      <div className="row">
        <label>
          סטטוס
          <select value={status} onChange={(e) => setStatus(e.target.value as DrawStatus | '')}>
            <option value="">הכל</option>
            {Object.entries(DRAW_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <QueryState q={q}>
        {(draws) =>
          draws.length === 0 ? (
            <Empty />
          ) : (
            <table>
              <thead>
                <tr>
                  <th>מס׳ הגרלה</th>
                  <th>תאריך</th>
                  <th>סטטוס</th>
                  <th>דורש טיפול</th>
                </tr>
              </thead>
              <tbody>
                {draws.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={`/draws/${d.id}`}>{d.drawNumber}</Link>
                    </td>
                    <td>{formatDate(d.drawAt)}</td>
                    <td>
                      <Badge tone={d.status === 'results_suggested' ? 'amber' : d.status === 'settled' ? 'green' : 'blue'}>
                        {DRAW_STATUS_LABEL[d.status]}
                      </Badge>
                    </td>
                    <td>{d.needsAttention && <Badge tone="red">דורש טיפול</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </QueryState>
    </>
  );
}
