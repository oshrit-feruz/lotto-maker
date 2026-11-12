import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaymentReturn } from '@/components/checkout/PaymentReturn';

export const metadata: Metadata = { title: 'התשלום בוטל' };

export default function PaymentCanceledPage() {
  return (
    <>
      <h1>התשלום בוטל</h1>
      <Suspense>
        <PaymentReturn mode="canceled" />
      </Suspense>
    </>
  );
}
