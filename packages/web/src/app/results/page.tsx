import type { Metadata } from 'next';
import Link from 'next/link';
import { Balls } from '@/components/Balls';
import { formatDate, formatShekel } from '@/lib/format';
import { PRIZE_TIER_GAME_LABELS } from '@/lib/labels';
import { publicGet } from '@/lib/server-api';
import type { LatestResult, PrizeTierView } from '@/lib/types';

export const metadata: Metadata = { title: 'תוצאות לוטו' };
// Rendered per request (never baked at build time); the backend data itself is cached by fetch.
export const dynamic = 'force-dynamic';

const TIER_ORDER = ['6+s', '6', '5+s', '5', '4+s', '4', '3+s', '3', '2'];

function PrizeTable({ game, tiers }: { game: string; tiers: PrizeTierView[] }) {
  const rows = [...tiers].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  return (
    <div className="table-wrap">
      <h3>{PRIZE_TIER_GAME_LABELS[game] ?? game}</h3>
      <table className="table">
        <thead>
          <tr>
            <th>ניחוש</th>
            <th>זוכים</th>
            <th>פרס לזוכה</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.tier}>
              <td dir="ltr" style={{ textAlign: 'end' }}>
                {t.tier.replace('+s', ' + חזק')}
              </td>
              <td>{t.winnersCount}</td>
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
  const result = await publicGet<LatestResult>('/results/lotto/latest', 300);
  const tiers = result?.prizeTiers ?? [];
  const games = ['lotto', 'double', 'extra'].filter((g) => tiers.some((t) => t.game === g));

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
            הגרלה {result.drawNumber} · {formatDate(result.drawDate)}
          </h2>
          <Balls numbers={result.winningNumbers} strong={result.strongNumber} />
          {games.length > 0 ? (
            <div className="stack" style={{ marginTop: 16 }}>
              {games.map((g) => (
                <PrizeTable key={g} game={g} tiers={tiers.filter((t) => t.game === g)} />
              ))}
            </div>
          ) : (
            <p className="small muted" style={{ marginTop: 12 }}>
              טבלת הפרסים להגרלה זו תפורסם כאן בקרוב.
            </p>
          )}
        </section>
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
