import { requireSession, type SearchParams } from '@/lib/require-session';
import { OrderDetail } from '@/components/account/OrderDetail';

export default function OrderPage({ params, searchParams }: Readonly<{ params: { id: string }; searchParams: SearchParams }>) {
  requireSession(`/account/orders/${encodeURIComponent(params.id)}`, searchParams);
  return <OrderDetail id={params.id} />;
}
