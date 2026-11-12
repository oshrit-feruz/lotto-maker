import { OrderDetail } from '@/components/account/OrderDetail';

export default function OrderPage({ params }: { params: { id: string } }) {
  return <OrderDetail id={params.id} />;
}
