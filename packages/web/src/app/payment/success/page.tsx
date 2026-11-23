import type { Metadata } from 'next';
import { requireSession, type SearchParams } from '@/lib/require-session';
import { Suspense } from 'react';
import { PaymentReturn } from '@/components/checkout/PaymentReturn';

export const metadata: Metadata = { title: 'אישור תשלום' };

export default function PaymentSuccessPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  requireSession('/payment/success', searchParams);
  return (
    <>
      <h1>אישור תשלום</h1>
      <Suspense>
        <PaymentReturn mode="success" />
      </Suspense>
    </>
  );
}
