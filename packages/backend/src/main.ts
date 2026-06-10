import { buildApp } from './server.js';
import { config } from './config.js';
import { startResultsScheduler } from './modules/results/results.scheduler.js';

const app = await buildApp();

await app.listen({ port: config.PORT, host: '0.0.0.0' });
startResultsScheduler();
