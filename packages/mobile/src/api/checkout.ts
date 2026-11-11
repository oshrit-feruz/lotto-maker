import { useEffect, useRef } from 'react';
import { AppState, Linking } from 'react-native';
import { walletApi } from './client.js';
import type { PaymentStatus } from './client.js';

const POLL_ATTEMPTS = 8;
const POLL_INTERVAL_MS = 1500;

/** Creates a payment and opens the provider's hosted checkout page. */
export async function openCheckout(amount: number): Promise<string> {
  const { paymentId, checkoutUrl } = await walletApi.createCheckout(amount);
  await Linking.openURL(checkoutUrl);
  return paymentId;
}

/**
 * Waits for the server to hear from the payment provider. The wallet is
 * credited server-side by the provider's webhook, which can land a moment
 * after the user returns from the checkout page.
 */
export async function waitForPayment(paymentId: string): Promise<PaymentStatus> {
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    const { status } = await walletApi.getPayment(paymentId);
    if (status !== 'pending') return status;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return 'pending';
}

/** Runs `callback` each time the app returns to the foreground. */
export function useOnForeground(callback: () => void) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    let previous = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (previous !== 'active' && next === 'active') saved.current();
      previous = next;
    });
    return () => sub.remove();
  }, []);
}

export function depositErrorMessage(err: unknown): string {
  const code = (err as { code?: string }).code;
  if (code === 'WALLET_CAP_EXCEEDED') return 'הסכום חורג מתקרת היתרה המותרת בארנק.';
  if (code === 'PAYMENT_PROVIDER_NOT_CONFIGURED') return 'טעינת הארנק אינה זמינה כרגע.';
  return 'לא ניתן לפתוח את דף התשלום. נסה שנית.';
}
