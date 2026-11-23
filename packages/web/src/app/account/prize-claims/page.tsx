import { requireSession, type SearchParams } from '@/lib/require-session';
import { PrizeClaims } from '@/components/account/PrizeClaims';

export default function PrizeClaimsPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  requireSession('/account/prize-claims', searchParams);
  return <PrizeClaims />;
}
