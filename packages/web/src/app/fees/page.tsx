import type { Metadata } from 'next';
import { FeeCalculator } from '@/components/FeeCalculator';

export const metadata: Metadata = { title: 'מחשבון עמלות' };

export default function FeesPage() {
  return (
    <>
      <h1>מחשבון עמלות</h1>
      <p>
        המחיר מורכב ממחיר הטופס הרשמי, אקסטרה אם בחרתם, ועמלת שירות קבועה לכל טופס בכל הגרלה. בחרו את סוג הטופס כדי לראות
        את המחיר המלא, בדיוק כפי שיחויב.
      </p>
      <FeeCalculator />
    </>
  );
}
