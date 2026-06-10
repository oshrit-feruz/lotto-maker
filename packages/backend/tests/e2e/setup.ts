// Must run before any backend module imports config.ts
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32chars-long!!';
