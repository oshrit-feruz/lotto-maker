import cron from 'node-cron';
import { processResults } from './results.service.js';

const JERUSALEM_TZ = 'Asia/Jerusalem';

export function startResultsScheduler() {
  // Lotto: Tue/Thu/Sat draw at 21:00 IL — check results at 22:00
  cron.schedule('0 22 * * 2,4,6', () => {
    void processResults('lotto', new Date());
  }, { timezone: JERUSALEM_TZ });

  // Chance: same draw days, check at 22:30
  cron.schedule('30 22 * * 2,4,6', () => {
    void processResults('chance', new Date());
  }, { timezone: JERUSALEM_TZ });

  // 777: check at 21:00
  cron.schedule('0 21 * * 2,4,6', () => {
    void processResults('seven77', new Date());
  }, { timezone: JERUSALEM_TZ });

  // 123: check at 21:30
  cron.schedule('30 21 * * 2,4,6', () => {
    void processResults('one23', new Date());
  }, { timezone: JERUSALEM_TZ });
}
