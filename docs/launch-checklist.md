# Launch checklist

Everything here is an **owner action**: none of it can be done in code. Code-side production
setup (services, env vars, migrations, backups) is in [deploy.md](deploy.md).

Mark each item with the date and who confirmed it.

## Legal and company

- [ ] **Legal opinion** (owner action). Written opinion from an Israeli lawyer that a paid service
      filling and submitting Pais forms for customers is permitted, and under which conditions
      (advertising, the brand name, how money is held, age checks).
- [ ] **Company and trust account** (owner action). A company (not the עוסק מורשה) and a separate
      trust / client-money bank account that holds customer wallet balances and ticket money, apart
      from the business's own funds.
- [ ] **Accountant approval of the receipt format** (owner action). The fee receipt
      (`packages/backend/src/modules/receipts`) is not a tax invoice until an accountant approves
      its format, numbering and VAT handling. Then set `BUSINESS_NAME`, `BUSINESS_ID`,
      `BUSINESS_ADDRESS` and `VAT_RATE` to the approved values.
- [ ] **Sales-point contract** (owner action). Signed agreement with the Pais sales point(s) whose
      operators key the forms: hours, volume, liability for a form keyed wrongly, and who keeps the
      original tickets.

## Providers

- [ ] **Payment provider that accepts the lottery sector** (owner action). Many Israeli acquirers
      refuse gambling-adjacent merchants: get written acceptance for this business category,
      then a real provider replaces the mock (`PAYMENT_PROVIDER`), with its webhook secret in
      `PAYMENT_WEBHOOK_SECRET`. Until then deposits are closed in production.
- [ ] **KYC provider** (owner action). Contract for ID + age verification; until it is integrated,
      KYC returns 503 in production (`KYC_PROVIDER` only has `mock`).
- [ ] **SMS provider** (owner action). Open an account with InforU, 019 SMS or Twilio and get
      the sender ID approved for Israel (InforU / 019 require the sender name or number to be
      verified before they deliver). Then set `SMS_PROVIDER` (`inforu` | `sms019` | `twilio`),
      `SMS_SENDER` and that provider's credentials (`INFORU_USERNAME` + `INFORU_TOKEN`,
      `SMS019_USERNAME` + `SMS019_TOKEN`, or `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` +
      `TWILIO_FROM_NUMBER`). Production refuses to start with a chosen provider that is missing
      its settings; with no provider at all it starts but nobody can log in (OTP returns 503).
      Send yourself a real OTP after deploying: the request formats follow the providers'
      public docs but were not tried against a live account.

## Product checks

- [ ] **Verify the systematic rules at a terminal** (owner action). Key each supported systematic
      form type at a real Pais terminal and confirm the table count and price match
      `packages/shared` pricing.
- [x] **Pais prize units** confirmed on 15/11/2026 from a real `getNextLotteryDate` response:
      `firstPrize` is in shekels (8000000 for an 8 million prize). Its `secondPrize` (750000) is
      not the double-lotto prize; only its raw text is stored. The double-lotto first prize is always
      twice the lotto first prize, so it is derived from `firstPrize`.
- [ ] **App-store policy** (owner action). Apple and Google restrict real-money gambling apps
      (licence / geo-restriction requirements). Confirm the mobile app qualifies, or launch web-only.

## Configuration

- [ ] **`CHECKOUT_RETURN_ORIGINS`** (owner action). Set to the production web origin(s), https
      only. Production will not start without it.
- [ ] `ALLOWED_ORIGINS` lists the production web, admin and operator origins.
- [ ] `ID_ENCRYPTION_KEY` and `ID_HASH_KEY` generated once and backed up outside the platform.
- [ ] A restore drill has been done (deploy.md, *Restore drill*).

## Communications

- [ ] **One-time re-login after the refresh-token fix** (owner action). Refresh tokens issued
      before the fix were signed with the access-token secret and are now rejected, so every user
      who signed in before it is logged out once and must sign in again with an OTP. Tell existing
      users (beta testers) in advance; expect a burst of OTP SMS right after the deploy.
