import cron from 'node-cron';
import { TIMEZONE } from '@lotto-maker/shared';
import { runPrizeClaimJob } from './prize-claims.service.js';

/** Daily at 09:00 Israel time: expire unclaimed prizes and send the 7-day reminders. */
export function startPrizeClaimScheduler(): void {
  cron.schedule(
    '0 9 * * *',
    () => {
      void runPrizeClaimJob().catch((e) => console.error('[prize-claims] daily job failed:', e));
    },
    { timezone: TIMEZONE },
  );
}
