'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { auth } from '@/lib/api-client';

const TABS = [
  { href: '/account', label: 'סקירה' },
  { href: '/account/orders', label: 'הזמנות' },
  { href: '/account/wallet', label: 'ארנק ומשיכות' },
  { href: '/account/cards', label: 'כרטיסים' },
  { href: '/account/prize-claims', label: 'זכיות לאיסוף' },
];

export function AccountNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await auth.logout().catch(() => undefined);
    router.replace('/');
    router.refresh();
  }

  return (
    <>
      <div className="spread">
        <h1 style={{ margin: 0 }}>האזור האישי</h1>
        <button className="btn btn-ghost btn-sm" onClick={logout} disabled={busy}>
          התנתקות
        </button>
      </div>
      <nav className="tabs" aria-label="האזור האישי">
        {TABS.map((t) => {
          const current = t.href === '/account' ? pathname === t.href : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={current ? 'page' : undefined}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
