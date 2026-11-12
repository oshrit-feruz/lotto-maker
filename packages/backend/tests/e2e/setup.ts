// Must run before any backend module imports config.ts.
//
// Needs: TEST_DATABASE_URL (or DATABASE_URL) for a migrated Postgres, TEST_REDIS_URL (or REDIS_URL).
// Every external provider runs on its mock / dev path: payments (PAYMENT_PROVIDER=mock, webhooks
// signed with PAYMENT_WEBHOOK_SECRET), KYC (KYC_PROVIDER=mock), SMS (no Twilio credentials: the OTP
// is only logged), push (firebase-admin is mocked in the test) and R2 (mocked in the test).
// In CI: .github/workflows/ci.yml, job "backend-e2e".
//
// The suites share one process (singleFork), so this file runs once per test file against the env
// the previous run left: decide about the database only on the first run.
if (process.env.E2E_DATABASE === undefined) {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  // Without a database the DB-backed tests skip themselves; config.ts still needs a well-formed URL.
  process.env.E2E_DATABASE = databaseUrl ? '1' : '0';
  process.env.DATABASE_URL = databaseUrl ?? 'postgresql://placeholder@localhost:5432/placeholder';
}

process.env.NODE_ENV = 'test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32chars-long!!';

process.env.PAYMENT_PROVIDER = 'mock';
process.env.PAYMENT_WEBHOOK_SECRET = 'e2e-webhook-secret-0123456789abcdef';
process.env.PUBLIC_API_URL = 'http://localhost:3000';
process.env.CHECKOUT_RETURN_ORIGINS = 'http://localhost:5173';
process.env.KYC_PROVIDER = 'mock';
process.env.KYC_MOCK_FORCE_MANUAL_REVIEW = 'false';
process.env.ID_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
process.env.ID_HASH_KEY = Buffer.alloc(32, 2).toString('base64');
process.env.BUSINESS_NAME = 'E2E Test Ltd';
process.env.BUSINESS_ID = '000000000';
process.env.BUSINESS_ADDRESS = 'Test St 1';
process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
// No Twilio / Firebase / R2 credentials: dev paths and mocks only
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.TWILIO_AUTH_TOKEN;
delete process.env.TWILIO_FROM_NUMBER;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
