import { fromZonedTime } from 'date-fns-tz';
import { TIMEZONE } from '@lotto-maker/shared';
import { prisma } from '../../prisma.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { fetchLottoDraw, fetchNextLotteryInfo } from './draws.sync.js';
import type { ParsedLottoDraw } from '../../services/pais-lotto-parser.js';

/**
 * Imports past lotto draws (results and prize tables) so the public results page has history.
 *
 * Walks back from the draw before the next one and stops at the first draw older than
 * BACKFILL_DAYS. Draws already in the DB are skipped without a request, so a daily run fetches
 * nothing once the window is filled. Imported draws have no orders, so they are stored as
 * `settled` directly: there is nothing to confirm or pay. Draws we sold tickets for always go
 * through the normal suggest → admin confirm → settle path, because they are in the DB before
 * their results exist.
 */
export const BACKFILL_DAYS = 61;
/** Hard cap on draws walked per run (about 3 draws a week). */
const MAX_DRAWS_PER_RUN = 40;
/** Pause between Pais requests: one page at a time, no burst. */
const REQUEST_GAP_MS = 1500;
/** Pais shows the draw at 23:00 Israel time; only the calendar date is on the results page. */
const DRAW_TIME = '23:00:00';

export function drawAtFromDate(drawDate: string): Date {
  return fromZonedTime(`${drawDate}T${DRAW_TIME}`, TIMEZONE);
}

export interface BackfillResult {
  imported: number[];
  skipped: number;
  failed: number[];
}

export async function backfillPastDraws(
  now: Date = new Date(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<BackfillResult> {
  const since = new Date(now.getTime() - BACKFILL_DAYS * 24 * 60 * 60_000);
  const next = await fetchNextLotteryInfo();
  const result: BackfillResult = { imported: [], skipped: 0, failed: [] };
  let fetched = 0;

  for (let n = next.drawNumber - 1, walked = 0; n > 0 && walked < MAX_DRAWS_PER_RUN; n--, walked++) {
    const existing = await prisma.draw.findUnique({ where: { drawNumber: n }, select: { drawAt: true } });
    if (existing) {
      if (existing.drawAt < since) break;
      result.skipped++;
      continue;
    }

    if (fetched > 0) await sleep(REQUEST_GAP_MS);
    fetched++;
    let parsed: ParsedLottoDraw;
    try {
      parsed = await fetchLottoDraw(n);
    } catch (err) {
      // One missing page should not stop the run; it is retried on the next one.
      result.failed.push(n);
      console.warn(`[draws] backfill: draw ${n} not imported:`, (err as Error).message);
      continue;
    }

    const drawAt = drawAtFromDate(parsed.drawDate);
    if (drawAt < since) break;
    if (await storePastDraw(parsed, drawAt, now)) result.imported.push(n);
  }

  if (result.imported.length > 0) {
    await writeAuditLog({
      entityType: 'draw',
      entityId: 'backfill',
      action: 'draw:history_imported',
      actorType: 'system',
      metadata: { drawNumbers: result.imported },
    });
  }
  return result;
}

/** Creates a past draw with its results; false when it already exists (a concurrent run). */
async function storePastDraw(parsed: ParsedLottoDraw, drawAt: Date, now: Date): Promise<boolean> {
  try {
    await prisma.draw.create({
      data: {
        drawNumber: parsed.drawNumber,
        drawAt,
        salesCloseAt: drawAt,
        numbers: parsed.numbers,
        strong: parsed.strong,
        extraDigits: parsed.extraDigits,
        status: 'settled',
        suggestedAt: now,
        confirmedAt: now,
        settledAt: now,
        prizeTiers: {
          create: parsed.prizeTiers.map((t) => ({
            game: t.game,
            tier: t.tier,
            winnersCount: t.winnersCount,
            prizeAmount: t.prizeAmount,
          })),
        },
      },
    });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return false;
    throw err;
  }
}
