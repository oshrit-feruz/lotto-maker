import { requireSession, type SearchParams } from '@/lib/require-session';
import { WalletView } from '@/components/account/WalletView';
import { Withdrawals } from '@/components/account/Withdrawals';

export default function WalletPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  requireSession('/account/wallet', searchParams);
  return (
    <>
      <WalletView />
      <Withdrawals />
    </>
  );
}
