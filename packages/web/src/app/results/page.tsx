import type { Metadata } from 'next';
import Link from 'next/link';
import { Balls } from '@/components/Balls';
import { DrawPicker } from '@/components/results/DrawPicker';
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

function PrizeTable({ table, open }: Readonly<{ table: PrizeTableData; open: boolean }>) {
  return (
    <details className="prize-table" open={open}>
      <summary>{table.title}</summary>
      <div className="table-wrap">
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
    </details>
  );
}

/** Previous / next draw arrows, shown at the top of the results card. */
function DrawNav({ history, drawNumber }: Readonly<{ history: ResultDrawRef[]; drawNumber: number }>) {
  const { newer, older } = drawNeighbors(history, drawNumber);
  if (!newer && !older) return null;
  return (
    <nav className="draw-nav" aria-label="מעבר בין הגרלות">
      {older ? (
        <Link className="btn btn-ghost btn-sm" href={`/results?draw=${older.drawNumber}`} rel="prev">
          → הקודמת
        </Link>
      ) : (
        <span />
      )}
      {newer ? (
        <Link className="btn btn-ghost btn-sm" href={`/results?draw=${newer.drawNumber}`} rel="next">
          הבאה ←
        </Link>
      ) : (
        <span />
      )}
    </nav>
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
  const isLatest = Boolean(result && history[0]?.drawNumber === result.drawNumber);
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
      <div className="alert alert-warn small">
        התוצאות כאן מוצגות לנוחותכם בלבד. <strong>התוצאות הרשמיות הן אך ורק אלו שמפרסם מפעל הפיס.</strong> במקרה של
        סתירה, הפרסום של מפעל הפיס הוא הקובע.
      </div>
      <DrawPicker history={history} drawNumber={result?.drawNumber ?? requested} />
      {result ? (
        <section className="card">
          <div className="draw-head">
            <div>
              <h2>
                הגרלה {result.drawNumber}
                {isLatest ? <span className="badge">האחרונה</span> : null}
              </h2>
              <p className="small muted">{formatDate(result.drawAt)}</p>
            </div>
            <DrawNav history={history} drawNumber={result.drawNumber} />
          </div>
          <Balls numbers={result.numbers} strong={result.strong} />
          {result.extraDigits?.length ? (
            <p style={{ marginTop: 12 }}>
              ספרות אקסטרה: <strong dir="ltr">{result.extraDigits.join(' ')}</strong>
            </p>
          ) : null}
          {tables.length > 0 ? (
            <div className="stack" style={{ marginTop: 16 }}>
              {tables.map((t, i) => (
                <PrizeTable key={t.game} table={t} open={i === 0} />
              ))}
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 12 }}>
              טבלת הפרסים להגרלה זו תפורסם כאן בקרוב.
            </p>
          )}
        </section>
      ) : (
        noResult
      )}
      <section className="card results-cta">
        <p>
          <strong>ההגרלה הבאה כבר בדרך.</strong> ממלאים טופס באתר ואנחנו שולחים אותו בשבילכם.
        </p>
        <div className="row">
          <Link className="btn btn-accent" href="/ticket">
            למילוי טופס
          </Link>
          <Link className="btn btn-ghost" href="/account/orders">
            הטפסים שלי
          </Link>
        </div>
      </section>
    </>
  );
}
