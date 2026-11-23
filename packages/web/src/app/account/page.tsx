import { requireSession, type SearchParams } from '@/lib/require-session';
import { AccountOverview } from '@/components/account/AccountOverview';

export default function AccountPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  requireSession('/account', searchParams);
  return <AccountOverview />;
}
