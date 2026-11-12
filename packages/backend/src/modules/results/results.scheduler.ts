import cron from 'node-cron';
import { processResultsWithRetry } from './results.service.js';

const JERUSALEM_TZ = 'Asia/Jerusalem';

export function startResultsScheduler() {
  // Lotto is handled by the draws scheduler (modules/draws/draws.sync.ts): results are scraped as a
  // suggestion, an admin confirms them, then the settlement job pays. Not here.

  // Chance settlement not yet supported end-to-end — disabled until verified
  // cron.schedule('30 22 * * 2,4,6', () => {
  //   void processResultsWithRetry('chance', new Date());
  // }, { timezone: JERUSALEM_TZ });

  // 777: check at 21:00
  cron.schedule('0 21 * * 2,4,6', () => {
    void processResultsWithRetry('seven77', new Date());
  }, { timezone: JERUSALEM_TZ });

  // 123: check at 21:30
  cron.schedule('30 21 * * 2,4,6', () => {
    void processResultsWithRetry('one23', new Date());
  }, { timezone: JERUSALEM_TZ });
}
