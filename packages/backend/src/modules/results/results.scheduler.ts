import { startSettlementScheduler } from './settlement.service.js';

export function startResultsScheduler() {
  // Lotto: the draws scheduler (modules/draws/draws.sync.ts) scrapes results as a suggestion,
  // an admin confirms them, and the settlement job below pays.
  //
  // chance / 777 / 123: no settlement. They accept no new orders (ENABLED_GAMES=lotto) and the old
  // result jobs used a wrong win rule, so they are not scheduled any more.
  startSettlementScheduler();
}
