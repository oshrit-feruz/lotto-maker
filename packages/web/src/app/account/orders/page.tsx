import { requireSession, type SearchParams } from '@/lib/require-session';
import { OrdersList } from '@/components/account/OrdersList';

export default function OrdersPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  requireSession('/account/orders', searchParams);
  return <OrdersList />;
}
