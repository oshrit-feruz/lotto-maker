import Link from 'next/link';
import { BRAND_NAME } from '@/lib/config';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand">
          {BRAND_NAME}
        </Link>
        <nav className="nav" aria-label="ניווט ראשי">
          <Link href="/ticket">מילוי טופס</Link>
          <Link href="/results">תוצאות</Link>
          <Link href="/account">האזור האישי</Link>
        </nav>
      </div>
    </header>
  );
}
