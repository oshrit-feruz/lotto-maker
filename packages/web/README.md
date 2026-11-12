# @lotto-maker/web

Customer website (Next.js 14 App Router, TypeScript, Hebrew RTL, mobile first).

```bash
cp .env.example .env.local      # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_BRAND_NAME
npm run dev -w packages/web     # http://localhost:3002 (the backend uses 3000)
npm run build -w packages/web   # builds @lotto-maker/shared first
npm test -w packages/web        # Vitest
```

## Tokens: httpOnly cookies behind a proxy

No token is ever readable by browser JavaScript (nothing in localStorage).

- `POST /api/auth/verify-otp` calls the backend and stores the access token (`lm_at`, 14 min)
  and refresh token (`lm_rt`, 30 days) in `httpOnly`, `SameSite=Lax`, `Secure` (production) cookies.
- The browser calls the backend only through `/api/proxy/<path>`. The route handler adds
  `Authorization: Bearer`, refreshes the access token on a missing cookie or a 401
  (`POST /auth/refresh`) and rotates both cookies.
- The proxy forwards only customer routes (`src/lib/proxy-allowlist.ts`, unit tested):
  admin, operator, webhook and dev mock routes are never reachable through it.
- Writes must carry a same-site `Origin`/`Referer` (CSRF guard, in addition to SameSite).
- `src/middleware.ts` redirects to `/login` from `/ticket`, `/checkout`, `/payment/*` and
  `/account/*` when there is no session cookie. The backend still authorises every call.

Public pages (home, results, about, terms, privacy) are server-rendered and fetch the backend
directly from the server:

- Home: `GET /draws/next` (prizes, countdown to `visibleCutoff`). 404 `NO_OPEN_DRAW` shows an empty state.
- Results: `GET /results/latest?game=lotto` with the lotto, double and Extra prize tables.
  404 `RESULTS_NOT_AVAILABLE` shows an empty state.
- `/fees` prices a sample ticket in the browser from the public `GET /prices` (through the proxy,
  no session needed), with the backend's formula (`priceFromList` in `src/lib/price.ts`).

## Payment flow

`/checkout` pays from the wallet (`POST /orders`) when the balance covers the total. Otherwise it
tops up the missing amount (`POST /payments/checkout`) and redirects to the hosted page, with
`successUrl` = `<origin>/payment/success` and `cancelUrl` = `<origin>/payment/canceled`. The backend
adds `?paymentId=` to both, and refuses an origin missing from its `CHECKOUT_RETURN_ORIGINS`
(422 `INVALID_RETURN_URL`), so set that to this site's origin. The ticket (numbers only) waits in
`sessionStorage`, with the payment id as a fallback for the query string. `/payment/success` polls
`GET /payments/:id` and, once approved, places the order. `/payment/canceled` checks the status once.

Every `POST /orders` carries an `Idempotency-Key` (`src/lib/order-key.ts`): one key per ticket,
kept in `sessionStorage` until the order succeeds. A retry or a reload after payment sends the same
key, and the backend returns the original order (`replayed: true`) without charging again. Editing
the ticket gets a new key; 409 `IDEMPOTENCY_KEY_REUSED` drops the key so the next try starts fresh.

Withdrawals show the fee, the net amount and the minimum from `GET /wallet/withdrawals/quote`
(debounced) before the request is sent.
