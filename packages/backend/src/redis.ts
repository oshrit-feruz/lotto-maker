import { Redis } from 'ioredis';
import { config } from './config.js';

// A command fails after a couple of reconnect attempts instead of waiting forever, so a Redis
// outage shows up as errors (rate limits fail open, /ready reports it) rather than hung requests.
// (BullMQ would need maxRetriesPerRequest: null on its own connection; nothing uses BullMQ yet.)
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 2,
  connectTimeout: 5000,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  console.error('[Redis] connection error:', err.message || err.name || String(err));
});

redis.on('connect', () => console.log('[Redis] connected'));
