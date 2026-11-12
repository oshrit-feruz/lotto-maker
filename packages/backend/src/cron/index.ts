import { startResultsScheduler } from '../modules/results/results.scheduler.js';
import { startDrawsScheduler } from '../modules/draws/draws.sync.js';
import { startSubscriptionScheduler } from '../services/subscription-scheduler.js';

export function startAllSchedulers(): void {
  startResultsScheduler();
  startDrawsScheduler();
  startSubscriptionScheduler();
}
