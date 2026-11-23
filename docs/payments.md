# Payments: Hyp Enterprise (CreditGuard)

Card payments go through a `PaymentProvider` (`packages/backend/src/modules/payments/`).
`PAYMENT_PROVIDER` picks one:

| Value | Use | Notes |
|---|---|---|
| `mock` (default) | dev and tests | Approves without charging. Refused in production (deposits return 503). |
| `hyp` | sandbox and production | Hyp Enterprise, formerly CreditGuard: the gateway behind `pps.creditguard.co.il`. |

## How a deposit works with `hyp`

1. The site calls `POST /payments/checkout` with the amount and its return URLs
   (`/payment/success`, `/payment/canceled`). The backend creates the `Payment` row
   (`pay…` id) and sends Hyp a `doDeal` with `validation=TxnSetup`,
   `mpiValidation=AutoComm` (one-phase sale), `cardNo=CGMPI`, `total` in agorot and our
   payment id as `uniqueid`.
2. Hyp answers with `mpiHostedPageUrl` (valid 10 minutes, one payment) and `token` (the page's
   `txId`, stored as `Payment.providerTxId`). The response has `embed: true`, so the checkout
   page shows the card page in an iframe, like Loto Sheli. The page collects card number,
   expiry, CVV and Israeli ID; card data never reaches our servers.
3. When the buyer finishes, Hyp sends the window to the success URL (or the error URL, which
   is the same page) with `txId`, `uniqueID`, `cardToken`, `cardExp`, `personalId`,
   `cardMask`, `authNumber` and `responseMac`.
4. The return page posts those parameters to `POST /payments/return`. The backend:
   - checks `responseMac` = SHA-256(password + txId + errorCode|"000" + cardToken + cardExp +
     personalId + uniqueId); without a valid MAC it answers 401 and calls nothing;
   - asks the gateway itself (`inquireTransactions`, `queryName=mpiTransaction`) for the
     status, amount and card. Nothing on the query string decides the outcome;
   - checks that the inquiry is for the same `uniqueid` and that the amount matches the payment;
   - credits the wallet through the same path as a webhook. The `pending -> approved` change is a
     conditional update, so a repeated return, a reload or a webhook for the same `txId` credits
     once.
5. The return page then polls `GET /payments/:id` as before and places the order.

Clients without a return page (the mobile app) get Hyp's pages sent to
`PUBLIC_API_URL/payments/return` and `/payments/return/cancel`, which verify the payment and
show a short message (override with `HYP_SUCCESS_URL`, `HYP_ERROR_URL`, `HYP_CANCEL_URL`).

### Saved cards, payouts and refunds

- **Saved card.** On an approved deposit the card token (`cardId`) and its expiry are saved
  as one opaque reference `<cardId>.<MMYY>` (`SavedCard.token`). It never leaves the server.
- **Charge a saved card** (`POST /payments/saved-card`, `{ cardId, amount, idempotencyKey }`):
  `doDeal` with `cardId` + `cardExpiration`, `validation=AutoComm`. For later deposits and
  auto-renew.
- **Payout to the card** (card withdrawals, prize credits): `doDeal` with
  `transactionType=Credit` on the saved token.
- **Refund** (a deposit we could not accept, e.g. over the wallet cap): `refundDeal` on the
  original gateway `tranId`, found through the mpiTransaction inquiry.

Charges and payouts are idempotent: our idempotency key (`deposit:<paymentId>`,
`withdrawal:<id>`) is hashed into the gateway's `user` field, and before every deal the backend
looks for a successful transaction with that `user` (`inquireTransactions`). A timeout leaves
the outcome unknown (the payment stays `pending`, the withdrawal is retried) and the retry
finds the first deal instead of charging twice.

## Settings

| Variable | Required | Notes |
|---|---|---|
| `PAYMENT_PROVIDER` | yes | `hyp` |
| `HYP_GATEWAY_URL` | yes | Full XML relay endpoint, `https://<server>.creditguard.co.il/xpo/Relay`. Test and production servers differ |
| `HYP_TERMINAL_NUMBER` | yes | Terminal number (digits) |
| `HYP_USER`, `HYP_PASSWORD` | yes (password is a secret) | API user. The password also keys `responseMac` |
| `HYP_MID` | yes | Merchant id for the hosted page |
| `HYP_SUCCESS_URL`, `HYP_ERROR_URL`, `HYP_CANCEL_URL` | no | Return pages when the client passes none |
| `HYP_LANGUAGE` | no | `HEB` (default) or `ENG` |
| `HYP_TIMEOUT_MS` | no | Default 20000. A call that times out counts as "outcome unknown" |
| `CHECKOUT_RETURN_ORIGINS` | yes | Also sent to Hyp as `frameAncestorURLs`: the origins allowed to frame the card page |
| `PUBLIC_API_URL` | yes | Builds the default return pages |

`PAYMENT_WEBHOOK_SECRET` is only for the mock provider and is not required with `hyp`.
Production refuses to start when a required `HYP_*` is missing or the gateway URL is not https.

The web app allows `/payment/*` to be framed by its own origin (`X-Frame-Options: SAMEORIGIN`)
so a return page that loads inside the card-page iframe can move the whole window; every other
page stays `DENY`. If the site gets a Content-Security-Policy, add
`frame-src https://*.creditguard.co.il`.

## What to ask Hyp for

1. **Test (UAT) environment**: relay URL, terminal number, API user and password, MID, and test
   cards. Then production values after certification.
2. **Hosted payment page (MPI / "Redirect")** enabled on the terminal, with the **iframe**
   option and our origins as frame ancestors.
3. **Tokenization (Card ID module)** on the terminal, so `cardToken` / `cardId` come back on the
   redirect and in the inquiry.
4. **Payout permission** (`transactionType=Credit`, "payout charge") and **refund permission**
   (`refundDeal`) on the terminal. Both are often off by default.
5. Hosted page fields: card number, expiry, CVV and **Israeli ID** (`useId`), Hebrew page,
   no installments.
6. Whether they can send **webhooks** (server-to-server notifications) for hosted-page payments,
   and their exact format. `POST /payments/webhook` accepts the redirect's fields (form or JSON,
   with `responseMac`) today.
7. The **merchant category approval** for a lottery-form service (see launch checklist).

## Assumptions to confirm in the sandbox

Marked `TODO(hyp-sandbox)` in `hyp-payment-provider.ts`:

- `responseMac` encoding: the Hello World guide says hex, the CG Redirect API PDF says base64.
  Both are accepted today; keep only the right one.
- `ppsJSONConfig.uiCustomData.redirectTargetParent: true` sends the parent window (not the
  iframe) to the return URL. The return page also breaks out of a frame by itself.
- `inquireTransactions` with `queryName=mpiTransaction` + `mpiTransactionId` (from the PDF; the
  newer docs list only `tranId` / `cgUid` / `user`) returns `statusCode`, `amount`, `cardId`,
  `cardExpiration`, `uniqueid` and `cgGatewayResponseXML` (with the `tranId` used for refunds).
- `cardToken` is returned with `mpiValidation=AutoComm` once tokenization is enabled (no
  separate "create token" flag is documented).
- A token charge or payout needs `cardExpiration` with `cardId`, and no CVV / ID.
- `inquireTransactions` finds a deal by `user` right after it was made (the idempotency check).
- A declined token deal answers with a non-`000` `result` / `status` (treated as "declined, nothing
  moved"); an HTTP error, timeout or unreadable answer is "unknown" and retried with the same key.
- Webhook payload format (step 6 above).

## Sandbox checklist

1. Set `PAYMENT_PROVIDER=hyp` and the test `HYP_*` values in `packages/backend/.env`; add the web
   origin to `CHECKOUT_RETURN_ORIGINS`.
2. Deposit from the checkout page with a test card: the iframe shows, the wallet is credited
   once, a saved card appears under the account.
3. Reload `/payment/success?...` with the same parameters: no second credit.
4. A declined test card: payment `failed`, nothing credited.
5. Cancel on the card page: back to `/payment/canceled`.
6. A card withdrawal: the payout appears in the Hyp back office; retrying the same withdrawal
   does not pay twice.
7. A deposit over the wallet cap (set `WALLET_BALANCE_CAP` low): the deposit is refunded.
