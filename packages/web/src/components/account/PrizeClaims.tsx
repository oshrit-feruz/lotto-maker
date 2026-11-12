'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';
import { formatDateTime, formatShekel } from '@/lib/format';
import { PRIZE_CLAIM_STATUS_LABELS } from '@/lib/labels';
import type { PrizeClaimView } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { ErrorNotice, Loading, NotAvailable } from './Notice';

/**
 * Big prizes are collected with the original ticket and the winner's ID.
 * GET /me/prize-claims, POST /me/prize-claims/:id/schedule {scheduledAt: ISO}.
 */
export function PrizeClaims() {
  const claims = useApi<PrizeClaimView[]>('me/prize-claims');
  const [when, setWhen] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function schedule(id: string) {
    const value = when[id];
    if (!value) {
      setError('בחרו מועד איסוף.');
      return;
    }
    const at = new Date(value);
    const claim = claims.data?.find((c) => c.id === id);
    if (Number.isNaN(at.getTime()) || at <= new Date() || (claim && at >= new Date(claim.expiresAt))) {
      setError('בחרו מועד עתידי, לפני תום תקופת האיסוף.');
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await api.post(`me/prize-claims/${encodeURIComponent(id)}/schedule`, { scheduledAt: at.toISOString() });
      claims.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card">
      <h2>זכיות לאיסוף</h2>
      <p className="small muted">
        זכייה גדולה נגבית עם הטופס המקורי ותעודת זהות. נתאם איתכם מועד לקבלת הטופס, ואת המימוש עצמו תבצעו מול מפעל
        הפיס לפי נהליו.
      </p>
      {error ? <ErrorNotice message={error} /> : null}
      {claims.notAvailable ? <NotAvailable what="זכיות לאיסוף" /> : null}
      {claims.loading && !claims.data ? <Loading /> : null}
      {claims.error ? <ErrorNotice message={claims.error} onRetry={claims.reload} /> : null}
      {claims.data && claims.data.length === 0 ? <p className="muted">אין זכיות שממתינות לאיסוף.</p> : null}
      {claims.data?.map((c) => (
        <div key={c.id} className="table-card">
          <div className="spread">
            <strong dir="ltr">{formatShekel(c.amount)}</strong>
            <span className="badge">{PRIZE_CLAIM_STATUS_LABELS[c.status] ?? c.status}</span>
          </div>
          <p className="small">
            <Link href={`/account/orders/${c.orderId}`}>להזמנה</Link>
            {c.scheduledAt ? ` · מועד איסוף: ${formatDateTime(c.scheduledAt)}` : ''}
            {c.status === 'awaiting_pickup' || c.status === 'scheduled' ? ` · לאסוף עד ${formatDateTime(c.expiresAt)}` : ''}
          </p>
          {c.status === 'awaiting_pickup' || c.status === 'scheduled' ? (
            <div className="row">
              <input
                type="datetime-local"
                className="input"
                style={{ maxWidth: 260 }}
                aria-label="מועד איסוף"
                value={when[c.id] ?? ''}
                onChange={(e) => setWhen((w) => ({ ...w, [c.id]: e.target.value }))}
              />
              <button className="btn btn-sm" onClick={() => void schedule(c.id)} disabled={busyId === c.id}>
                {c.scheduledAt ? 'שינוי מועד' : 'קביעת מועד'}
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
