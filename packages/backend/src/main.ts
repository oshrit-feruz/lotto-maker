import { buildApp } from './server.js';
import { config } from './config.js';
import { startAllSchedulers } from './cron/index.js';

const app = await buildApp();

await app.listen({ port: config.PORT, host: '0.0.0.0' });
startAllSchedulers();
