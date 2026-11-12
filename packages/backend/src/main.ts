import { buildApp } from './server.js';
import { config } from './config.js';
import { startAllSchedulers } from './cron/index.js';
import { ensureDefaultSeedData } from './lib/startup-seed.js';
import { backfillIdEncryption } from './lib/backfill-id-encryption.js';

const app = await buildApp();

await ensureDefaultSeedData();
// Encrypts any ID numbers still stored in plain text from before encryption existed
await backfillIdEncryption().catch((err) => console.error('[backfill] ID encryption backfill failed:', err));
await app.listen({ port: config.PORT, host: '0.0.0.0' });
startAllSchedulers();
