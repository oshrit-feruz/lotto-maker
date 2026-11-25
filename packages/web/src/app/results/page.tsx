import type { Metadata } from 'next';
import Link from 'next/link';
import { Balls } from '@/components/Balls';
import { formatCount, formatDate, formatShekel } from '@/lib/format';
import {
  drawNeighbors,
  parseDrawParam,
  prizeTables,
  type PrizeTable as PrizeTableData,
  type ResultDrawRef,
} from '@/lib/results';
import { publicFetch } from '@/lib/server-api';
import type { LottoResult } from '@/lib/types';

export const metadata: Metadata = { title: 'תוצאות לוטו' };
// Rendered per request (never baked at build time); the backend data itself is cached by fetch.
export const dynamic = 'force-dynamic';

function PrizeTable({ table }: Readonly<{ table: PrizeTableData }>) {
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

function DrawNav({ history, drawNumber }: Readonly<{ history: ResultDrawRef[]; drawNumber: number }>) {
  const { newer, older } = drawNeighbors(history, drawNumber);
  if (!newer && !older) return null;
  return (
    <nav className="spread" aria-label="מעבר בין הגרלות" style={{ marginTop: 16 }}>
      {older ? (
        <Link className="btn btn-ghost btn-sm" href={`/results?draw=${older.drawNumber}`}>
          → הגרלה קודמת ({older.drawNumber})
        </Link>
      ) : (
        <span />
      )}
      {newer ? (
        <Link className="btn btn-ghost btn-sm" href={`/results?draw=${newer.drawNumber}`}>
          הגרלה הבאה ({newer.drawNumber}) ←
        </Link>
      ) : null}
    </nav>
  );
}

function DrawList({ history, drawNumber }: Readonly<{ history: ResultDrawRef[]; drawNumber: number | null }>) {
  if (history.length < 2) return null;
  return (
    <section className="card">
      <h2>הגרלות קודמות</h2>
      <ul className="row" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {history.map((d) => (
          <li key={d.drawNumber}>
            <Link
              className="btn btn-ghost btn-sm"
              href={`/results?draw=${d.drawNumber}`}
              aria-current={d.drawNumber === drawNumber ? 'page' : undefined}
            >
              {d.drawNumber} · {formatDate(d.drawAt)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function ResultsPage({
  searchParams,
}: Readonly<{ searchParams: Record<string, string | string[] | undefined> }>) {
  const requested = parseDrawParam(searchParams.draw);
  const [res, historyRes] = await Promise.all([
    publicFetch<LottoResult>(requested ? `/results/${requested}` : '/results/latest?game=lotto', 300),
    publicFetch<ResultDrawRef[]>('/results/history?limit=30', 300),
  ]);
  const result = res.ok ? res.data : null;
  const history = historyRes.ok ? historyRes.data : [];
  // 404 RESULTS_NOT_AVAILABLE: no draw has confirmed results yet (or the requested one has none).
  const notYet = !res.ok && res.status === 404;
  const tables = result ? prizeTables(result) : [];
  const noResult = notYet ? (
    <div className="card empty">
      <p>
        {requested
          ? `אין תוצאות להצגה עבור הגרלה ${requested}.`
          : 'עדיין אין תוצאות מאושרות להצגה. התוצאות יופיעו כאן אחרי ההגרלה הקרובה.'}
      </p>
    </div>
  ) : (
    <div className="card">
      <p>התוצאות אינן זמינות כרגע. נסו שוב מאוחר יותר.</p>
    </div>
  );

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
          <DrawNav history={history} drawNumber={result.drawNumber} />
        </section>
      ) : (
        noResult
      )}
      <DrawList history={history} drawNumber={result?.drawNumber ?? null} />
      <p className="small">
        יש לכם טופס בהגרלה? <Link href="/account/orders">בדקו בהזמנות שלכם</Link>.
      </p>
    </>
  );
}
