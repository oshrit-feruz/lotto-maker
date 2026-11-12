import axios, { AxiosError } from 'axios';
import cron from 'node-cron';
import { prisma } from '../../prisma.js';
import { config } from '../../config.js';
import { ScraperNetworkError, ScraperValidationError } from '../../services/results-scraper.js';
import {
  parseCurrentLotto,
  parseNextLotteryResponse,
  PaisParseError,
  RESULTS_POLL_AFTER_DRAW_MINUTES,
} from '../../services/pais-lotto-parser.js';
import type { NextLotteryInfo, ParsedLottoDraw } from '../../services/pais-lotto-parser.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { markDrawResultsDelayed } from '../results/settlement.service.js';

// One request per draw (plus retries with backoff), a clear User-Agent, no archive crawling.
const USER_AGENT = 'LottoMakerResultsSync/1.0 (one request per draw)';
const baseUrl = () => config.PAIS_BASE_URL.replace(/\/$/, '');

async function getFromPais<T>(path: string, responseType: 'json' | 'text'): Promise<T> {
  try {
    const res = await axios.get<T>(`${baseUrl()}${path}`, {
      timeout: 10_000,
      headers: { 'User-Agent': USER_AGENT },
      responseType,
    });
    return res.data;
  } catch (err) {
    const detail = err instanceof AxiosError && err.response ? `HTTP ${err.response.status}` : 'no response';
    throw new ScraperNetworkError(`pais.co.il request failed (${detail}): ${path}`, err);
  }
}

export async function fetchNextLotteryInfo(): Promise<NextLotteryInfo> {
  const json = await getFromPais<unknown>('/include/getNextLotteryDate.ashx?type=1', 'json');
  try {
    return parseNextLotteryResponse(json);
  } catch (err) {
    if (err instanceof PaisParseError) throw new ScraperValidationError(err.message);
    throw err;
  }
}

export async function fetchLottoDraw(drawNumber: number): Promise<ParsedLottoDraw> {
  const html = await getFromPais<string>(`/Lotto/CurrentLotto.aspx?lotteryId=${drawNumber}`, 'text');
  let parsed: ParsedLottoDraw;
  try {
    parsed = parseCurrentLotto(html);
  } catch (err) {
    if (err instanceof PaisParseError) throw new ScraperValidationError(err.message);
    throw err;
  }
  if (parsed.drawNumber !== drawNumber) {
    throw new ScraperValidationError(`asked for draw ${drawNumber}, page is draw ${parsed.drawNumber}`);
  }
  return parsed;
}

/**
 * Keeps the upcoming draw in sync with getNextLotteryDate. A draw that is still `scheduled`
 * is updated when pais changes its times; draws past that stage are never touched.
 */
export async function syncUpcomingDraws(): Promise<void> {
  const info = await fetchNextLotteryInfo();
  const existing = await prisma.draw.findUnique({ where: { drawNumber: info.drawNumber } });
  if (!existing) {
    await prisma.draw.create({
      data: { drawNumber: info.drawNumber, drawAt: info.drawAt, salesCloseAt: info.salesCloseAt },
    });
    return;
  }
  if (
    existing.status === 'scheduled' &&
    (existing.salesCloseAt.getTime() !== info.salesCloseAt.getTime() ||
      existing.drawAt.getTime() !== info.drawAt.getTime())
  ) {
    await prisma.draw.update({
      where: { id: existing.id },
      data: { drawAt: info.drawAt, salesCloseAt: info.salesCloseAt },
    });
  }
}

// ─── Results: fetch once the draw is over, store as a SUGGESTION ─────────────

// Pais publishes results about an hour after the draw, once the committee approves
const RESULTS_WAIT_MINUTES = RESULTS_POLL_AFTER_DRAW_MINUTES;
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 2 * 60 * 60_000;

/** In-memory retry state. A restart only means one extra early retry. */
const attempts = new Map<number, { count: number; nextTryAt: number }>();

export function backoffMs(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

/** Stores scraped results on the draw as `results_suggested`. Nothing is paid here. */
export async function storeSuggestedResults(drawId: string, parsed: ParsedLottoDraw): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Only a draw still waiting for results can take a suggestion
    const { count } = await tx.draw.updateMany({
      where: { id: drawId, status: 'scheduled' },
      data: {
        numbers: parsed.numbers,
        strong: parsed.strong,
        extraDigits: parsed.extraDigits,
        status: 'results_suggested',
        suggestedAt: new Date(),
      },
    });
    if (count === 0) return false;
    await tx.prizeTier.deleteMany({ where: { drawId } });
    await tx.prizeTier.createMany({
      data: parsed.prizeTiers.map((t) => ({
        drawId,
        game: t.game,
        tier: t.tier,
        winnersCount: t.winnersCount,
        prizeAmount: t.prizeAmount,
      })),
    });
    return true;
  });
}

/** For draws whose time has passed and have no results yet: one request each, with backoff. */
export async function fetchDueResults(now: Date = new Date()): Promise<void> {
  const due = await prisma.draw.findMany({
    where: {
      status: 'scheduled',
      drawAt: { lte: new Date(now.getTime() - RESULTS_WAIT_MINUTES * 60_000) },
    },
    orderBy: { drawAt: 'asc' },
  });

  for (const draw of due) {
    const state = attempts.get(draw.drawNumber) ?? { count: 0, nextTryAt: 0 };
    if (state.count >= MAX_ATTEMPTS || now.getTime() < state.nextTryAt) continue;

    try {
      const parsed = await fetchLottoDraw(draw.drawNumber);
      const stored = await storeSuggestedResults(draw.id, parsed);
      attempts.delete(draw.drawNumber);
      if (stored) {
        await writeAuditLog({
          entityType: 'draw',
          entityId: draw.id,
          action: 'draw:results_suggested',
          actorType: 'system',
          metadata: { drawNumber: draw.drawNumber },
        });
      }
    } catch (err) {
      const count = state.count + 1;
      attempts.set(draw.drawNumber, { count, nextTryAt: now.getTime() + backoffMs(count) });
      console.warn(`[draws] results for draw ${draw.drawNumber} not available (attempt ${count}):`, (err as Error).message);
      if (count >= MAX_ATTEMPTS) await markDrawResultsDelayed(draw.id);
    }
  }
}

export function startDrawsScheduler(): void {
  const tz = { timezone: 'Asia/Jerusalem' };
  // Next draw and cutoff, including announced Thursday draws
  cron.schedule('*/30 * * * *', () => {
    void syncUpcomingDraws().catch((e) => console.error('[draws] sync failed:', (e as Error).message));
  }, tz);
  // Results: DB-only unless a draw is due, so a frequent tick costs no requests
  cron.schedule('*/5 * * * *', () => {
    void fetchDueResults().catch((e) => console.error('[draws] results fetch failed:', (e as Error).message));
  }, tz);
  void syncUpcomingDraws().catch((e) => console.error('[draws] initial sync failed:', (e as Error).message));
}
