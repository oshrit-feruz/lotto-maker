import type { Metadata } from 'next';
import { PlaceholderBanner } from '@/components/PlaceholderBanner';
import { BRAND_NAME, HELPLINE } from '@/lib/config';

export const metadata: Metadata = { title: 'תקנון' };

// PLACEHOLDER: to be written by a lawyer. The headings only list topics the terms must cover.
export default function TermsPage() {
  return (
    <article className="card">
      <PlaceholderBanner />
      <h1>תקנון השימוש ב{BRAND_NAME}</h1>
      <p className="muted">[מציין מקום. הנושאים שהתקנון צריך לכסות:]</p>
      <ol>
        <li>מהות השירות: שירות שליחות פרטי להגשת טפסים בנקודות מכירה מורשות; אין קשר למפעל הפיס ואין הרשאה ממנו.</li>
        <li>זכאות: גיל 18 ומעלה, אימות זהות, חשבון אחד לאדם.</li>
        <li>הזמנה, מועדי סגירה, ומה קורה כשטופס לא הוגש בזמן (החזר).</li>
        <li>מחירים, עמלת שירות, ארנק, טעינה ומשיכה.</li>
        <li>זכיות: זכיות קטנות לארנק, זכיות גדולות באיסוף עם הטופס המקורי.</li>
        <li>תוצאות: הקובעות הן של מפעל הפיס בלבד.</li>
        <li>אחריות, הגבלת אחריות, ביטול וסיום שירות.</li>
        <li>הימורים אחראיים: קו סיוע {HELPLINE}, הגבלה עצמית.</li>
        <li>דין וסמכות שיפוט.</li>
      </ol>
    </article>
  );
}
