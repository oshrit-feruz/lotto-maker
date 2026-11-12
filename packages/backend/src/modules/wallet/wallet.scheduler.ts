import cron from 'node-cron';
import { runCardCreditJob } from './card-credits.service.js';

/** Every 5 minutes: pay due card credits (prize excess) and retry card withdrawals left unpaid. */
export function startWalletScheduler(): void {
  cron.schedule('*/5 * * * *', () => {
    void runCardCreditJob().catch((e) => console.error('[card-credits] job failed:', e));
  });
}
