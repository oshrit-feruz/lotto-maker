import type { Metadata } from 'next';
import { requireSession, type SearchParams } from '@/lib/require-session';
import { CheckoutView } from '@/components/checkout/CheckoutView';

export const metadata: Metadata = { title: 'תשלום' };

export default function CheckoutPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  requireSession('/checkout', searchParams);
  return (
    <>
      <h1>תשלום</h1>
      <CheckoutView />
    </>
  );
}
