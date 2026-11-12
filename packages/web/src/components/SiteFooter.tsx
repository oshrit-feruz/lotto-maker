import Link from 'next/link';
import { BRAND_NAME, HELPLINE } from '@/lib/config';

/** Shown on every page: agency disclaimer, responsible gaming, 18+. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <nav className="footer-links" aria-label="קישורים">
          <Link href="/about">אודות</Link>
          <Link href="/fees">מחשבון עמלות</Link>
          <Link href="/terms">תקנון</Link>
          <Link href="/privacy">מדיניות פרטיות</Link>
          <Link href="/results">תוצאות</Link>
        </nav>
        <div className="disclaimer">
          <p>
            <strong>{BRAND_NAME}</strong> הוא שירות שליחות פרטי: אנו מגישים את הטפסים בשמכם בנקודות מכירה מורשות.
            השירות <strong>אינו קשור למפעל הפיס, אינו מטעמו ואינו מורשה על ידו</strong>.
          </p>
          <p>
            <span className="age-badge" aria-label="מגיל 18 בלבד">
              18+
            </span>
            השתתפות בהגרלות מותרת מגיל 18 בלבד. הימורים עלולים להתמכר. שחקו באחריות ובסכומים שאתם יכולים להרשות
            לעצמכם להפסיד. לעזרה ותמיכה בהתמכרות להימורים: קו סיוע <a href={`tel:${HELPLINE}`}>{HELPLINE}</a>.
          </p>
          <p className="small">התוצאות הרשמיות הן אך ורק אלו המפורסמות על ידי מפעל הפיס.</p>
        </div>
      </div>
    </footer>
  );
}
