// The browser reaches the backend only through /api/proxy/*, and only for the
// customer-facing routes below. Admin, operator, webhook and dev-only routes
// are never proxied.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

const ID = '[A-Za-z0-9_-]{1,64}';
const RESERVED = new Set(['webhook', 'mock-checkout', 'checkout']);

const RULES: Array<{ methods: HttpMethod[]; pattern: RegExp }> = [
  { methods: ['GET', 'PUT'], pattern: /^me$/ },
  { methods: ['POST'], pattern: /^me\/kyc$/ },
  { methods: ['GET'], pattern: /^me\/cards$/ },
  { methods: ['DELETE'], pattern: new RegExp(`^me/cards/${ID}$`) },
  { methods: ['GET'], pattern: /^me\/prize-claims$/ },
  { methods: ['POST'], pattern: new RegExp(`^me/prize-claims/${ID}/schedule$`) },
  { methods: ['POST'], pattern: /^tickets\/(calculate|check-duplicate|lottomat)$/ },
  { methods: ['GET', 'POST'], pattern: /^orders$/ },
  { methods: ['GET'], pattern: new RegExp(`^orders/${ID}(/scan)?$`) },
  { methods: ['GET'], pattern: /^wallet\/(balance|transactions)$/ },
  { methods: ['GET', 'POST'], pattern: /^wallet\/withdrawals$/ },
  { methods: ['POST'], pattern: new RegExp(`^wallet/withdrawals/${ID}/cancel$`) },
  { methods: ['POST'], pattern: /^payments\/checkout$/ },
  { methods: ['GET'], pattern: new RegExp(`^payments/${ID}$`) },
  { methods: ['GET'], pattern: /^draws\/upcoming$/ },
  { methods: ['GET'], pattern: /^results\/lotto\/latest$/ },
];

/** True when `method path` (path without leading slash, e.g. "orders/abc/scan") may be proxied. */
export function isProxyAllowed(method: string, path: string): boolean {
  const segments = path.split('/');
  if (segments.some((s) => !/^[A-Za-z0-9_-]{1,64}$/.test(s))) return false;
  if (segments[0] === 'payments' && segments.length === 2 && method === 'GET' && RESERVED.has(segments[1]!)) {
    return false;
  }
  return RULES.some((r) => r.methods.includes(method as HttpMethod) && r.pattern.test(path));
}
