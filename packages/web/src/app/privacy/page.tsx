import type { Metadata } from 'next';
import { PlaceholderBanner } from '@/components/PlaceholderBanner';
import { BRAND_NAME } from '@/lib/config';

export const metadata: Metadata = { title: 'מדיניות פרטיות' };

// PLACEHOLDER: to be written by a lawyer. The headings only list topics the policy must cover.
export default function PrivacyPage() {
  return (
    <article className="card">
      <PlaceholderBanner />
      <h1>מדיניות הפרטיות של {BRAND_NAME}</h1>
      <p className="muted">[מציין מקום. הנושאים שהמדיניות צריכה לכסות:]</p>
      <ol>
        <li>אילו פרטים נאספים: טלפון, שם, תעודת זהות (מוצפנת), תאריך לידה, פרטי תשלום (אצל חברת הסליקה), צילומי טפסים.</li>
        <li>למה: אימות גיל וזהות, ביצוע ההזמנה, תשלום, גביית זכיות, חובות דין.</li>
        <li>עם מי משותף: חברת סליקה, ספקי SMS ואחסון, רשויות לפי דין.</li>
        <li>אבטחה ושמירה: הצפנה, תקופות שמירה, מחיקה.</li>
        <li>עוגיות: עוגיות התחברות הכרחיות (httpOnly) בלבד.</li>
        <li>זכויות עיון, תיקון ומחיקה, ופרטי קשר.</li>
      </ol>
    </article>
  );
}
