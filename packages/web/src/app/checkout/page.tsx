import type { Metadata } from 'next';
import { CheckoutView } from '@/components/checkout/CheckoutView';

export const metadata: Metadata = { title: 'תשלום' };

export default function CheckoutPage() {
  return (
    <>
      <h1>תשלום</h1>
      <CheckoutView />
    </>
  );
}
