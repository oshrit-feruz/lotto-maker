import cron from 'node-cron';
import { issueMissingReceipts } from './receipts.service.js';

/** Every minute: issue missing receipts and the credit receipts of refunded orders. */
export function startReceiptScheduler(): void {
  cron.schedule('* * * * *', () => {
    void issueMissingReceipts().catch((e) => console.error('[receipts] sweep failed:', e));
  });
}
