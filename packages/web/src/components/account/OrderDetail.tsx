'use client';

import Link from 'next/link';
import { TICKET_TYPE_LABELS, getSystematicRule } from '@lotto-maker/shared';
import { formatDateTime, formatShekel } from '@/lib/format';
import { PRIZE_CLAIM_STATUS_LABELS, PRIZE_TIER_GAME_LABELS, orderStatusLabel, orderStatusTone } from '@/lib/labels';
import type { OrderView } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { Balls } from '../Balls';
import { BlurredScan } from './BlurredScan';
import { ErrorNotice, Loading } from './Notice';
import { winTotal } from './OrdersList';

export function OrderDetail({ id }: { id: string }) {
  const { data: o, error, loading, reload } = useApi<OrderView>(`orders/${encodeURIComponent(id)}`);
  if (loading) return <Loading />;
  if (error || !o) return <ErrorNotice message={error ?? 'ההזמנה לא נמצאה.'} onRetry={reload} />;

  const rule = o.ticket?.systematicType ? getSystematicRule(o.ticket.systematicType) : null;
  const win = winTotal(o);
  const drawn = o.draw && o.draw.numbers.length > 0;

  return (
    <>
      <p>
        <Link href="/account/orders">← כל ההזמנות</Link>
      </p>
      <div className="grid-2">
        <section className="card">
          <div className="spread">
            <h2 style={{ margin: 0 }}>{o.draw ? `הגרלה ${o.draw.drawNumber}` : 'הזמנה'}</h2>
            <span className={`badge ${orderStatusTone(o.status)}`}>{orderStatusLabel(o.status)}</span>
          </div>
          <p className="small muted">
            {formatDateTime(o.draw?.drawAt ?? o.drawTime)}
            {o.ticket ? ` · ${TICKET_TYPE_LABELS[o.ticket.type]}` : ''}
            {rule ? ` · ${rule.label}` : ''}
            {o.ticket?.extra ? ' · אקסטרה' : ''}
          </p>
          {o.ticket ? (
            <ol style={{ paddingInlineStart: 20 }}>
              {o.ticket.tables.map((t) => (
                <li key={t.position} style={{ marginBottom: 6 }}>
                  <Balls numbers={t.numbers} strong={t.strongNumbers} />
                </li>
              ))}
            </ol>
          ) : null}
          {o.extraDigits?.length ? (
            <p className="small">
              ספרות אקסטרה: <span dir="ltr">{o.extraDigits.join(' ')}</span>
            </p>
          ) : null}
          <p className="small">
            שולם: <span dir="ltr">{formatShekel(o.totalCharged)}</span> (טופס{' '}
            <span dir="ltr">{formatShekel(o.price)}</span>, עמלה <span dir="ltr">{formatShekel(o.fee)}</span>)
          </p>
        </section>

        <section className="card">
          <h2>תוצאה</h2>
          {drawn && o.draw ? (
            <>
              <p className="small muted">המספרים שעלו בהגרלה:</p>
              <Balls numbers={o.draw.numbers} strong={o.draw.strong} />
            </>
          ) : (
            <p className="muted">ההגרלה עוד לא התקיימה או שהתוצאות טרם אושרו.</p>
          )}
          {o.wins?.length ? (
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>משחק</th>
                    <th>דרגה</th>
                    <th>פעמים</th>
                    <th>סכום</th>
                  </tr>
                </thead>
                <tbody>
                  {o.wins.map((w) => (
                    <tr key={`${w.game}-${w.tier}`}>
                      <td>{PRIZE_TIER_GAME_LABELS[w.game] ?? w.game}</td>
                      <td dir="ltr">{w.tier}</td>
                      <td>{w.count}</td>
                      <td dir="ltr">{formatShekel(w.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="price-total">
                סה״כ זכייה: <span dir="ltr">{formatShekel(win)}</span>
              </p>
            </div>
          ) : null}
          {o.prizeClaim ? (
            <div className="alert alert-info small">
              זכייה גדולה: {PRIZE_CLAIM_STATUS_LABELS[o.prizeClaim.status] ?? o.prizeClaim.status}.{' '}
              <Link href="/account/prize-claims">לתיאום איסוף</Link>
            </div>
          ) : null}
          <p className="small muted">התוצאות הרשמיות הן אלו של מפעל הפיס בלבד.</p>
        </section>
      </div>

      <section className="card">
        <h2>צילום הטופס</h2>
        {o.hasScan ? <BlurredScan orderId={o.id} /> : <p className="muted">הצילום יופיע כאן אחרי שהטופס יוגש.</p>}
      </section>
    </>
  );
}
