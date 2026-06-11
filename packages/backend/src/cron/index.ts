import { startResultsScheduler } from '../modules/results/results.scheduler.js';
import { startSubscriptionScheduler } from '../services/subscription-scheduler.js';

export function startAllSchedulers(): void {
  startResultsScheduler();
  startSubscriptionScheduler();
}
