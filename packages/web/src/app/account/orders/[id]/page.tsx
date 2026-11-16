import { OrderDetail } from '@/components/account/OrderDetail';

export default function OrderPage({ params }: Readonly<{ params: { id: string } }>) {
  return <OrderDetail id={params.id} />;
}
