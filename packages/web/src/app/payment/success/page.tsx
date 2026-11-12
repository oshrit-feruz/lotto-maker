import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaymentReturn } from '@/components/checkout/PaymentReturn';

export const metadata: Metadata = { title: 'אישור תשלום' };

export default function PaymentSuccessPage() {
  return (
    <>
      <h1>אישור תשלום</h1>
      <Suspense>
        <PaymentReturn mode="success" />
      </Suspense>
    </>
  );
}
