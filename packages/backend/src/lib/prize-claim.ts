import { config } from '../config.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last moment a big prize can be claimed: draw date + PRIZE_CLAIM_RETENTION_DAYS (default 182, about 6 months). */
export function claimExpiry(drawAt: Date): Date {
  return new Date(drawAt.getTime() + config.PRIZE_CLAIM_RETENTION_DAYS * DAY_MS);
}
