import { Redis } from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on('error', (err: Error) => {
  console.error('[Redis] connection error:', err.message || err.name || String(err));
});

redis.on('connect', () => console.log('[Redis] connected'));
