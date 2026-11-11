// Minimum env vars so that config.ts doesn't call process.exit(1) during unit tests
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://placeholder/placeholder';
process.env.JWT_SECRET ??= 'unit-test-jwt-secret-16chars!!';
process.env.JWT_REFRESH_SECRET ??= 'unit-test-refresh-secret-16chars!';
// Fake service account so NotificationService.getAdmin() activates the FCM code path
process.env.FIREBASE_SERVICE_ACCOUNT_JSON ??= Buffer.from('{}').toString('base64');
// Fake R2 credentials: signing a URL is a local computation, no network involved
process.env.R2_ACCOUNT_ID ??= 'unit-test-account';
process.env.R2_ACCESS_KEY_ID ??= 'unit-test-access-key';
process.env.R2_SECRET_ACCESS_KEY ??= 'unit-test-secret-key';
