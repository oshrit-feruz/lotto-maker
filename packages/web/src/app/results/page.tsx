import type { Metadata } from 'next';
import Link from 'next/link';
import { Balls } from '@/components/Balls';
import { formatCount, formatDate, formatShekel } from '@/lib/format';
import { prizeTables, type PrizeTable as PrizeTableData } from '@/lib/results';
import { publicFetch } from '@/lib/server-api';
import type { LottoResult } from '@/lib/types';

export const metadata: Metadata = { title: 'תוצאות לוטו' };
// Rendered per request (never baked at build time); the backend data itself is cached by fetch.
export const dynamic = 'force-dynamic';

function PrizeTable({ table }: { table: PrizeTableData }) {
  return (
    <div className="table-wrap">
      <h3>{table.title}</h3>
      <table className="table">
        <thead>
          <tr>
            <th>ניחוש</th>
            <th>זוכים</th>
            <th>פרס לזוכה</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((t) => (
            <tr key={t.tier}>
              <td dir={t.ltr ? 'ltr' : undefined} style={t.ltr ? { textAlign: 'end' } : undefined}>
                {t.label}
              </td>
              <td>{formatCount(t.winnersCount)}</td>
              <td dir="ltr" style={{ textAlign: 'end' }}>
                {formatShekel(t.prizeAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ResultsPage() {
  const res = await publicFetch<LottoResult>('/results/latest?game=lotto', 300);
  const result = res.ok ? res.data : null;
  // 404 RESULTS_NOT_AVAILABLE: no draw has confirmed results yet.
  const notYet = !res.ok && res.status === 404;
  const tables = result ? prizeTables(result) : [];

  return (
    <>
      <h1>תוצאות לוטו</h1>
      <div className="alert alert-warn">
        התוצאות כאן מוצגות לנוחותכם בלבד. <strong>התוצאות הרשמיות הן אך ורק אלו שמפרסם מפעל הפיס.</strong> במקרה של
        סתירה, הפרסום של מפעל הפיס הוא הקובע.
      </div>
      {result ? (
        <section className="card">
          <h2>
            הגרלה {result.drawNumber} · {formatDate(result.drawAt)}
          </h2>
          <Balls numbers={result.numbers} strong={result.strong} />
          {result.extraDigits?.length ? (
            <p style={{ marginTop: 12 }}>
              ספרות אקסטרה: <strong dir="ltr">{result.extraDigits.join(' ')}</strong>
            </p>
          ) : null}
          {tables.length > 0 ? (
            <div className="stack" style={{ marginTop: 16 }}>
              {tables.map((t) => (
                <PrizeTable key={t.game} table={t} />
              ))}
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 12 }}>
              טבלת הפרסים להגרלה זו תפורסם כאן בקרוב.
            </p>
          )}
        </section>
      ) : notYet ? (
        <div className="card empty">
          <p>עדיין אין תוצאות מאושרות להצגה. התוצאות יופיעו כאן אחרי ההגרלה הקרובה.</p>
        </div>
      ) : (
        <div className="card">
          <p>התוצאות אינן זמינות כרגע. נסו שוב מאוחר יותר.</p>
        </div>
      )}
      <p className="small">
        יש לכם טופס בהגרלה? <Link href="/account/orders">בדקו בהזמנות שלכם</Link>.
      </p>
    </>
  );
}
