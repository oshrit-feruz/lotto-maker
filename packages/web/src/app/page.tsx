import Link from 'next/link';
import { BRAND_NAME } from '@/lib/config';
import { formatDateTime, formatShekel } from '@/lib/format';
import { publicGet } from '@/lib/server-api';
import type { UpcomingDraw } from '@/lib/types';

// Server-rendered; the draw list is cached for a minute.
export const revalidate = 60;

export default async function HomePage() {
  const upcoming = await publicGet<UpcomingDraw[]>('/draws/upcoming');
  const next = upcoming?.find((d) => d.gameType === 'lotto') ?? null;

  return (
    <>
      <section className="hero">
        <h1>ממלאים טופס לוטו, אנחנו שולחים אותו בשבילכם</h1>
        <p className="muted">
          {BRAND_NAME} הוא שירות שליחות פרטי: ממלאים טופס באתר, משלמים, ושליח מגיש אותו בנקודת מכירה מורשית. תקבלו
          צילום של הטופס ועדכון על זכייה.
        </p>
        <div className="draw-box" aria-live="polite">
          {next ? (
            <>
              <div className="small muted">ההגרלה הבאה{next.drawNumber ? ` (מס׳ ${next.drawNumber})` : ''}</div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{formatDateTime(next.drawTime)}</div>
              {next.firstPrize ? (
                <div>
                  פרס ראשון משוער: <strong>{formatShekel(next.firstPrize)}</strong>
                </div>
              ) : null}
              <div className="small muted">הזמנות נסגרות: {formatDateTime(next.hardCutoff)}</div>
            </>
          ) : (
            <div>מועד ההגרלה הבאה יתפרסם בקרוב.</div>
          )}
        </div>
        <Link href="/ticket" className="btn btn-accent">
          למילוי טופס
        </Link>
      </section>

      <section aria-labelledby="how">
        <h2 id="how">איך זה עובד</h2>
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
        <p style={{ marginTop: 16 }}>
          <Link href="/fees">כמה זה עולה? למחשבון העמלות</Link>
        </p>
      </section>
    </>
  );
}
