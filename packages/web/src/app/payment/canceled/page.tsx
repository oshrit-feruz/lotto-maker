import type { Metadata } from 'next';
import { requireSession, type SearchParams } from '@/lib/require-session';
import { Suspense } from 'react';
import { PaymentReturn } from '@/components/checkout/PaymentReturn';

export const metadata: Metadata = { title: 'התשלום בוטל' };

export default function PaymentCanceledPage({ searchParams }: Readonly<{ searchParams: SearchParams }>) {
  requireSession('/payment/canceled', searchParams);
  return (
    <>
      <h1>התשלום בוטל</h1>
      <Suspense>
        <PaymentReturn mode="canceled" />
      </Suspense>
    </>
  );
}
