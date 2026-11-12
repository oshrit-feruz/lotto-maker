import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listDraws } from '../api/draws';
import type { DrawStatus } from '../api/types';
import { Badge, Empty, Pager, QueryState } from '../components/ui';
import { formatDate } from '../lib/format';

import { DRAW_STATUS_LABEL } from '../lib/labels';
export { DRAW_STATUS_LABEL };

export const DRAWS_PAGE_SIZE = 25;

export default function DrawsPage() {
  const [status, setStatus] = useState<DrawStatus | ''>('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['draws', status, page],
    queryFn: () => listDraws({ ...(status ? { status } : {}), page, pageSize: DRAWS_PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <h1>הגרלות</h1>
      <div className="row">
        <label>
          סטטוס
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as DrawStatus | '');
              setPage(1);
            }}
          >
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
        {(data) =>
          data.items.length === 0 ? (
            <>
              <Empty />
              {page > 1 && (
                <button className="secondary" onClick={() => setPage(1)}>
                  לעמוד הראשון
                </button>
              )}
            </>
          ) : (
            <>
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
                  {data.items.map((d) => (
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
              <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} disabled={q.isFetching} />
            </>
          )
        }
      </QueryState>
    </>
  );
}
