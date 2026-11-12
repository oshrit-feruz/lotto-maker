import Link from 'next/link';
import { Countdown } from '@/components/Countdown';
import { BRAND_NAME } from '@/lib/config';
import { formatDateTime, formatShekel } from '@/lib/format';
import { publicGet } from '@/lib/server-api';
import type { UpcomingDraw } from '@/lib/types';

// Rendered per request (never baked at build time); the backend data itself is cached by fetch.
export const dynamic = 'force-dynamic';

/** "₪12,000,000", with the shekel sign set smaller than the digits. */
function PrizeAmount({ value }: { value: string }) {
  const text = formatShekel(value).replace(/\.00$/, '');
  const amount = text.replace('₪', '');
  return (
    <div className="prize" dir="ltr">
      {text.includes('₪') ? <span className="prize-cur">₪</span> : null}
      {amount}
    </div>
  );
}

export default async function HomePage() {
  const upcoming = await publicGet<UpcomingDraw[]>('/draws/upcoming');
  const next = upcoming?.find((d) => d.gameType === 'lotto') ?? null;

  return (
    <>
      <section className="hero">
        <div className="hero-balls" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="hero-copy">
          <h1>ממלאים טופס לוטו, אנחנו שולחים אותו בשבילכם</h1>
          <p>
            {BRAND_NAME} הוא שירות שליחות פרטי: ממלאים טופס באתר, משלמים, ושליח מגיש אותו בנקודת מכירה מורשית. תקבלו
            צילום של הטופס ועדכון על זכייה.
          </p>
        </div>
        <div className="draw-box stub" aria-live="polite">
          {next ? (
            <>
              <div className="draw-meta">
                <span>ההגרלה הבאה{next.drawNumber ? ` (מס׳ ${next.drawNumber})` : ''}</span>
                <strong>{formatDateTime(next.drawTime)}</strong>
              </div>
              {next.firstPrize ? (
                <>
                  <p className="prize-label">פרס ראשון משוער</p>
                  <PrizeAmount value={next.firstPrize} />
                </>
              ) : null}
              <div className="perf" aria-hidden="true" />
              <p className="countdown-label">ההזמנות נסגרות בעוד</p>
              <Countdown until={next.hardCutoff} />
              <p className="cutoff-line">הזמנות נסגרות: {formatDateTime(next.hardCutoff)}</p>
            </>
          ) : (
            <p style={{ marginBottom: 16 }}>מועד ההגרלה הבאה יתפרסם בקרוב.</p>
          )}
          <Link href="/ticket" className="btn btn-accent btn-lg btn-block">
            למילוי טופס
          </Link>
        </div>
      </section>

      <section aria-labelledby="how">
        <div className="section-head">
          <h2 id="how">איך זה עובד</h2>
          <Link href="/fees">כמה זה עולה? למחשבון העמלות</Link>
        </div>
        <ol className="steps">
          <li>
            <h3>ממלאים טופס</h3>
            <p className="muted">לוטו רגיל או דאבל, בוחרים מספרים או לוטומט, ומוסיפים אקסטרה אם רוצים.</p>
          </li>
          <li>
            <h3>משלמים</h3>
            <p className="muted">מהארנק באתר או בכרטיס אשראי. המחיר כולל את מחיר הטופס ואת עמלת השירות, בלי הפתעות.</p>
          </li>
          <li>
            <h3>אנחנו מגישים</h3>
            <p className="muted">השליח מגיש את הטופס בנקודת מכירה מורשית, ואתם מקבלים צילום שלו ועדכון על התוצאה.</p>
          </li>
        </ol>
      </section>
    </>
  );
}
