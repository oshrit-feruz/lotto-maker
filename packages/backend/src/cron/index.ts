import { startResultsScheduler } from '../modules/results/results.scheduler.js';
import { startDrawsScheduler } from '../modules/draws/draws.sync.js';
import { startSubscriptionScheduler } from '../services/subscription-scheduler.js';

import { startWalletScheduler } from '../modules/wallet/wallet.scheduler.js';
import { startPrizeClaimScheduler } from '../modules/prize-claims/prize-claims.scheduler.js';
import { startReceiptScheduler } from '../modules/receipts/receipts.scheduler.js';

export function startAllSchedulers(): void {
  startWalletScheduler();
  startPrizeClaimScheduler();
  startResultsScheduler();
  startDrawsScheduler();
  startSubscriptionScheduler();
  startReceiptScheduler();
}
