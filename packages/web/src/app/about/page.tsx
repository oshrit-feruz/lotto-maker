import type { Metadata } from 'next';
import Link from 'next/link';
import { BRAND_NAME } from '@/lib/config';

export const metadata: Metadata = { title: 'אודות' };

export default function AboutPage() {
  return (
    <article className="card">
      <h1>אודות {BRAND_NAME}</h1>
      <p>
        {BRAND_NAME} הוא שירות שליחות פרטי. אתם ממלאים טופס לוטו באתר ומשלמים, ושליח שלנו מגיש את הטופס בשמכם בנקודת
        מכירה מורשית לפני סגירת ההגרלה. אחרי ההגשה תקבלו צילום של הטופס, ואחרי ההגרלה עדכון על התוצאה.
      </p>
      <p>
        <strong>איננו מפעל הפיס ואיננו פועלים מטעמו או בהרשאתו.</strong> מחיר הטופס הוא המחיר הרשמי, ובנוסף אליו נגבית
        עמלת שירות שמוצגת לפני כל תשלום.
      </p>
      <h2>זכיות</h2>
      <p>
        זכיות קטנות מזוכות לארנק באתר, ואפשר למשוך אותן לכרטיס או לחשבון בנק. זכייה גדולה נגבית עם הטופס המקורי ותעודת
        זהות, ונתאם אתכם את מסירת הטופס.
      </p>
      <h2>משחק אחראי</h2>
      <p>
        השירות מיועד לבני 18 ומעלה בלבד. אם ההימורים מפסיקים להיות בילוי, פנו לקו הסיוע 118.
      </p>
      <p>
        <Link href="/fees">מחשבון עמלות</Link> · <Link href="/terms">תקנון</Link> · <Link href="/privacy">פרטיות</Link>
      </p>
    </article>
  );
}
