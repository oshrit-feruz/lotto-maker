import Link from 'next/link';
import { Countdown } from '@/components/Countdown';
import { BRAND_NAME } from '@/lib/config';
import { formatDateTime, formatShekel } from '@/lib/format';
import { publicFetch } from '@/lib/server-api';
import type { NextDraw } from '@/lib/types';

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
  const res = await publicFetch<NextDraw>('/draws/next');
  const next = res.ok ? res.data : null;
  // 404 NO_OPEN_DRAW: no draw is open for orders right now (e.g. between the sales close and the next sync).
  const noOpenDraw = !res.ok && res.status === 404;
  // The countdown runs to the cutoff shown to users, which is a little before the backend's hard cutoff.
  const cutoff = next ? next.visibleCutoff || next.hardCutoff : null;

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
                <strong>{formatDateTime(next.drawAt)}</strong>
              </div>
              {next.firstPrize ? (
                <>
                  <p className="prize-label">פרס ראשון משוער</p>
                  <PrizeAmount value={next.firstPrize} />
                  {next.doublePrize ? (
                    <p className="prize-label">
                      בדאבל לוטו: <span dir="ltr">{formatShekel(next.doublePrize).replace(/\.00$/, '')}</span>
                    </p>
                  ) : null}
                </>
              ) : null}
              <div className="perf" aria-hidden="true" />
              <p className="countdown-label">ההזמנות נסגרות בעוד</p>
              <Countdown until={cutoff!} />
              <p className="cutoff-line">הזמנות נסגרות: {formatDateTime(cutoff)}</p>
            </>
          ) : noOpenDraw ? (
            <div style={{ marginBottom: 16 }}>
              <p className="prize-label">אין כרגע הגרלה פתוחה להזמנות</p>
              <p>ההזמנות להגרלה האחרונה נסגרו, ומועד ההגרלה הבאה יתפרסם כאן בקרוב.</p>
            </div>
          ) : (
            <p style={{ marginBottom: 16 }}>לא הצלחנו לטעון את פרטי ההגרלה הבאה. נסו לרענן את העמוד בעוד רגע.</p>
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
