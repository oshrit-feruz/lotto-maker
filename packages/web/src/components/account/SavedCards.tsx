'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import type { SavedCardView } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { ErrorNotice, Loading, NotAvailable } from './Notice';

/** GET /me/cards, DELETE /me/cards/:id. Only brand and last 4 digits ever reach the browser. */
export function SavedCards() {
  const cards = useApi<SavedCardView[]>('me/cards');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm('להסיר את הכרטיס?')) return;
    setBusyId(id);
    setError(null);
    try {
      await api.del(`me/cards/${encodeURIComponent(id)}`);
      cards.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card">
      <h2>כרטיסים שמורים</h2>
      {error ? <ErrorNotice message={error} /> : null}
      {cards.notAvailable ? <NotAvailable what="כרטיסים שמורים" /> : null}
      {cards.loading && !cards.data ? <Loading /> : null}
      {cards.error ? <ErrorNotice message={cards.error} onRetry={cards.reload} /> : null}
      {cards.data && cards.data.length === 0 ? (
        <p className="muted empty-note">אין כרטיסים שמורים. כרטיס נשמר אוטומטית אחרי טעינה מוצלחת.</p>
      ) : null}
      {cards.data?.map((c) => (
        <div key={c.id} className="spread" style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
          <span>
            {c.brand ?? 'כרטיס'} <span dir="ltr">•••• {c.last4}</span>{' '}
            {c.isDefault ? <span className="badge">ברירת מחדל</span> : null}
          </span>
          <button className="btn btn-danger btn-sm" onClick={() => void remove(c.id)} disabled={busyId === c.id}>
            הסרה
          </button>
        </div>
      ))}
    </section>
  );
}
