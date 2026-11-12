'use client';

import { useState } from 'react';
import { formatDateTime, formatShekel } from '@/lib/format';
import { TX_TYPE_LABELS } from '@/lib/labels';
import type { Paged, WalletTransactionView } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { ErrorNotice, Loading } from './Notice';

const PAGE_SIZE = 20;

export function WalletView() {
  const [page, setPage] = useState(1);
  const balance = useApi<{ balance: string }>('wallet/balance');
  const txs = useApi<Paged<WalletTransactionView>>(`wallet/transactions?page=${page}&limit=${PAGE_SIZE}`);
  const pages = txs.data ? Math.max(1, Math.ceil(txs.data.total / txs.data.limit)) : 1;

  return (
    <>
      <section className="card">
        <h2>יתרה</h2>
        {balance.error ? (
          <ErrorNotice message={balance.error} onRetry={balance.reload} />
        ) : (
          <p className="price-total" dir="ltr" style={{ textAlign: 'end' }}>
            {balance.data ? formatShekel(balance.data.balance) : '…'}
          </p>
        )}
        <p className="small muted">הארנק נטען בתשלום בכרטיס בעת הזמנת טופס, ומזוכה בזכיות קטנות ובהחזרים.</p>
      </section>

      <section className="card">
        <h2>תנועות</h2>
        {txs.loading && !txs.data ? <Loading /> : null}
        {txs.error ? <ErrorNotice message={txs.error} onRetry={txs.reload} /> : null}
        {txs.data && txs.data.data.length === 0 ? <p className="muted empty-note">אין תנועות עדיין.</p> : null}
        {txs.data && txs.data.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>סוג</th>
                  <th>תיאור</th>
                  <th>סכום</th>
                </tr>
              </thead>
              <tbody>
                {txs.data.data.map((t) => (
                  <tr key={t.id}>
                    <td className="small">{formatDateTime(t.createdAt)}</td>
                    <td>{TX_TYPE_LABELS[t.type] ?? t.type}</td>
                    <td className="small">{t.description}</td>
                    <td dir="ltr">{formatShekel(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {pages > 1 ? (
          <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
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
      </section>
    </>
  );
}
