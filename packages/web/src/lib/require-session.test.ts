import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { cookie: undefined as string | undefined, dest: null as string | null };
vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name === 'lm_rt' && state.cookie ? { value: state.cookie } : undefined) }),
  headers: () => ({ get: (name: string) => (name === 'sec-fetch-dest' ? state.dest : null) }),
}));
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

const { requireSession, loginPath } = await import('./require-session');

describe('requireSession', () => {
  beforeEach(() => {
    state.cookie = undefined;
    state.dest = null;
    redirect.mockClear();
  });

  it('lets a request with the refresh cookie through', () => {
    state.cookie = 'rt';
    expect(() => requireSession('/account')).not.toThrow();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends a request without it to the login page, keeping path and query', () => {
    expect(() => requireSession('/payment/success', { paymentId: 'p1' })).toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login?next=%2Fpayment%2Fsuccess%3FpaymentId%3Dp1');
  });

  it('lets the payment return page load inside the card-page iframe', () => {
    state.dest = 'iframe';
    expect(() => requireSession('/payment/success', { paymentId: 'p1' })).not.toThrow();
    expect(() => requireSession('/account')).toThrow('NEXT_REDIRECT');
  });
});

describe('loginPath', () => {
  it('encodes repeated and missing values', () => {
    expect(loginPath('/account')).toBe('/login?next=%2Faccount');
    expect(loginPath('/checkout', { a: ['1', '2'], b: undefined })).toBe('/login?next=%2Fcheckout%3Fa%3D1%26a%3D2');
  });
});
