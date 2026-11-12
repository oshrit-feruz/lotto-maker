import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { BRAND_NAME } from '@/lib/config';

export const metadata: Metadata = {
  title: { default: `${BRAND_NAME}: שליחת טפסי לוטו`, template: `%s | ${BRAND_NAME}` },
  description: `${BRAND_NAME}: שירות שליחות פרטי למילוי והגשת טפסי לוטו בנקודות מכירה מורשות. מגיל 18 בלבד.`,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f4c45',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <SiteHeader />
        <main>
          <div className="container">{children}</div>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
