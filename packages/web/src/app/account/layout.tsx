import type { Metadata } from 'next';
import { AccountNav } from '@/components/account/AccountNav';

export const metadata: Metadata = { title: 'האזור האישי' };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AccountNav />
      {children}
    </>
  );
}
