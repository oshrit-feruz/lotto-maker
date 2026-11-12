'use client';

import Link from 'next/link';
import { formatShekel } from '@/lib/format';
import type { Me } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { ProfileForm } from '../ProfileForm';
import { ErrorNotice, Loading } from './Notice';

export function AccountOverview() {
  const me = useApi<Me>('me');
  const balance = useApi<{ balance: string }>('wallet/balance');

  if (me.loading) return <Loading />;
  if (me.error || !me.data) return <ErrorNotice message={me.error ?? 'שגיאה'} onRetry={me.reload} />;

  const u = me.data;
  return (
    <div className="grid-2">
      <section className="card">
        <h2>פרטים אישיים</h2>
        {u.verifiedAdult ? (
          <dl className="small">
            <dt className="muted">שם</dt>
            <dd>{u.fullName ?? '—'}</dd>
            <dt className="muted">טלפון</dt>
            <dd dir="ltr" style={{ textAlign: 'end' }}>
              {u.phone}
            </dd>
            <dt className="muted">תעודת זהות</dt>
            <dd>{u.idLast4 ? `מסתיימת ב־${u.idLast4}` : '—'}</dd>
          </dl>
        ) : (
          <>
            <div className="alert alert-info">כדי להזמין טפסים יש להשלים את הפרטים ולאמת גיל 18+.</div>
            <ProfileForm onDone={me.reload} />
          </>
        )}
      </section>
      <section className="card">
        <h2>ארנק</h2>
        <p className="price-total" dir="ltr" style={{ textAlign: 'end' }}>
          {balance.data ? formatShekel(balance.data.balance) : formatShekel(u.walletBalance)}
        </p>
        <div className="row">
          <Link className="btn" href="/ticket">
            מילוי טופס
          </Link>
          <Link className="btn btn-ghost" href="/account/wallet">
            תנועות ומשיכות
          </Link>
        </div>
      </section>
    </div>
  );
}
