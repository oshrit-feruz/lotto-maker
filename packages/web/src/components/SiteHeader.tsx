import Link from 'next/link';
import { BRAND_NAME } from '@/lib/config';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          {BRAND_NAME}
        </Link>
        <nav className="nav" aria-label="ניווט ראשי">
          <Link href="/ticket" className="nav-cta">
            מילוי טופס
          </Link>
          <Link href="/results">תוצאות</Link>
          <Link href="/account">האזור האישי</Link>
        </nav>
      </div>
    </header>
  );
}
