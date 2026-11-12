'use client';

import Link from 'next/link';
import { useState } from 'react';
import { TICKET_TYPE_LABELS } from '@lotto-maker/shared';
import { formatDateTime, formatShekel } from '@/lib/format';
import { orderStatusLabel, orderStatusTone } from '@/lib/labels';
import type { OrderView, Paged } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { ErrorNotice, Loading } from './Notice';

const PAGE_SIZE = 20;

export function winTotal(order: Pick<OrderView, 'wins'>): number {
  return (order.wins ?? []).reduce((sum, w) => sum + Number(w.amount || 0), 0);
}

export function OrdersList() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<OrderView>>(`orders?page=${page}&limit=${PAGE_SIZE}`);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNotice message={error} onRetry={reload} />;
  if (!data || data.data.length === 0) {
    return (
      <div className="card">
        <p>עדיין אין הזמנות.</p>
        <Link className="btn" href="/ticket">
          למילוי טופס ראשון
        </Link>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  return (
    <>
      {data.data.map((o) => {
        const win = winTotal(o);
        return (
          <Link key={o.id} href={`/account/orders/${o.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <div className="spread">
              <strong>
                {o.draw ? `הגרלה ${o.draw.drawNumber}` : 'הגרלה'}
                {o.ticket ? ` · ${TICKET_TYPE_LABELS[o.ticket.type]}` : ''}
              </strong>
              <span className={`badge ${orderStatusTone(o.status)}`}>{orderStatusLabel(o.status)}</span>
            </div>
            <div className="small muted">
              {formatDateTime(o.draw?.drawAt ?? o.drawTime)} · {o.ticket ? `${o.ticket.tables.length} טבלאות` : ''}
              {o.ticket?.extra ? ' · אקסטרה' : ''} · <span dir="ltr">{formatShekel(o.totalCharged)}</span>
            </div>
            {win > 0 ? (
              <div className="small" style={{ color: 'var(--ok)', fontWeight: 700 }}>
                זכייה: <span dir="ltr">{formatShekel(win)}</span>
              </div>
            ) : null}
          </Link>
        );
      })}
      {pages > 1 ? (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            הקודם
          </button>
          <span className="small">
            עמוד {page} מתוך {pages}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            הבא
          </button>
        </div>
      ) : null}
    </>
  );
}
