import { load } from 'cheerio';
import { parse as parseDate } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';
import {
  EXTRA_DIGIT_COUNT,
  LOTTO_NUMBER_MAX,
  LOTTO_PICK_COUNT,
  LOTTO_STRONG_MAX,
  TIMEZONE,
  validateExtraDigits,
} from '@lotto-maker/shared';

// Pure parsers for the two pais.co.il data sources used by lotto. No network here.
//
// TODO verify against the live site: the page structure below was written from the
// issue description, NOT from a captured live page (the fixture is synthetic, see its
// header). The selectors are all in SELECTORS so they can be fixed in one place.

export class PaisParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaisParseError';
  }
}

export type PrizeGameKey = 'lotto' | 'double' | 'extra';

export interface ParsedPrizeTier {
  game: PrizeGameKey;
  /** lotto/double: "6+s", "6", "5+s", ... "3". extra: "6" ... "2" (matching digits). */
  tier: string;
  winnersCount: number;
  /** ₪, as a decimal string with 2 decimals. */
  prizeAmount: string;
}

export interface ParsedLottoDraw {
  drawNumber: number;
  /** Local calendar date (Asia/Jerusalem) as yyyy-MM-dd. */
  drawDate: string;
  numbers: number[];
  strong: number;
  extraDigits: number[];
  prizeTiers: ParsedPrizeTier[];
}

const SELECTORS = {
  drawNumber: '.draw-number',
  drawDate: '.draw-date',
  numbers: '.lotto-numbers .num',
  strong: '.lotto-strong .num',
  extraDigits: '.extra-digits .digit',
  prizeTable: 'table.prize-table',
  /** The heading text that names a prize table (lotto / double / extra). */
  prizeTableTitle: 'caption',
} as const;

const intsFrom = (texts: string[]): number[] => texts.map((t) => parseInt(t.trim(), 10));

function parseMoney(text: string): string | null {
  const cleaned = text.replace(/[^\d.,]/g, '').replace(/,/g, '');
  if (cleaned === '' || Number.isNaN(Number(cleaned))) return null;
  return Number(cleaned).toFixed(2);
}

function gameOfTitle(title: string): PrizeGameKey | null {
  const t = title.toLowerCase();
  if (t.includes('כפול') || t.includes('double')) return 'double';
  if (t.includes('אקסטרה') || t.includes('extra')) return 'extra';
  if (t.includes('לוטו') || t.includes('lotto')) return 'lotto';
  return null;
}

/** "5 + חזק" -> "5+s", "5" -> "5". Extra: "4 ספרות" -> "4". null for rows that are not a tier. */
export function normalizeTier(game: PrizeGameKey, text: string): string | null {
  const digit = /([2-6])/.exec(text)?.[1];
  if (!digit) return null;
  if (game === 'extra') return digit;
  if (digit === '2') return null;
  return /חזק|strong/i.test(text) ? `${digit}+s` : digit;
}

/** Parses GET /Lotto/CurrentLotto.aspx?lotteryId=N. Throws PaisParseError on anything unexpected. */
export function parseCurrentLotto(html: string): ParsedLottoDraw {
  const $ = load(html);

  const drawNumber = parseInt($(SELECTORS.drawNumber).first().text().trim(), 10);
  if (!Number.isInteger(drawNumber) || drawNumber <= 0) throw new PaisParseError('draw number not found');

  const dateText = $(SELECTORS.drawDate).first().text().trim();
  const dateMatch = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(dateText);
  if (!dateMatch) throw new PaisParseError(`draw date not found in "${dateText}"`);
  const parsedDate = parseDate(dateMatch[0], 'd/M/yyyy', new Date(0));
  if (Number.isNaN(parsedDate.getTime())) throw new PaisParseError(`invalid draw date "${dateText}"`);
  const drawDate = `${dateMatch[3]}-${dateMatch[2]!.padStart(2, '0')}-${dateMatch[1]!.padStart(2, '0')}`;

  const numbers = intsFrom($(SELECTORS.numbers).map((_i, el) => $(el).text()).get());
  if (
    numbers.length !== LOTTO_PICK_COUNT ||
    new Set(numbers).size !== numbers.length ||
    numbers.some((n) => !Number.isInteger(n) || n < 1 || n > LOTTO_NUMBER_MAX)
  ) {
    throw new PaisParseError(`expected ${LOTTO_PICK_COUNT} distinct numbers 1-${LOTTO_NUMBER_MAX}, got [${numbers.join(',')}]`);
  }

  const strong = parseInt($(SELECTORS.strong).first().text().trim(), 10);
  if (!Number.isInteger(strong) || strong < 1 || strong > LOTTO_STRONG_MAX) {
    throw new PaisParseError('strong number missing or out of range');
  }

  const extraDigits = intsFrom($(SELECTORS.extraDigits).map((_i, el) => $(el).text()).get());
  if (!validateExtraDigits(extraDigits)) {
    throw new PaisParseError(`expected ${EXTRA_DIGIT_COUNT} Extra digits 1-7, got [${extraDigits.join(',')}]`);
  }

  const prizeTiers: ParsedPrizeTier[] = [];
  const seenGames = new Set<PrizeGameKey>();
  $(SELECTORS.prizeTable).each((_i, table) => {
    const game = gameOfTitle($(table).find(SELECTORS.prizeTableTitle).first().text());
    if (!game) return;
    seenGames.add(game);
    $(table)
      .find('tbody tr')
      .each((_j, row) => {
        const cells = $(row).find('td').map((_k, td) => $(td).text().trim()).get();
        if (cells.length < 3) return;
        const tier = normalizeTier(game, cells[0]!);
        if (!tier) return;
        const winnersCount = parseInt(cells[1]!.replace(/,/g, ''), 10);
        const money = parseMoney(cells[2]!);
        if (!Number.isInteger(winnersCount) || winnersCount < 0) {
          throw new PaisParseError(`${game} tier ${tier}: bad winners "${cells[1]}"`);
        }
        // A tier nobody won may show a dash instead of an amount
        const prizeAmount = money ?? (winnersCount === 0 ? '0.00' : null);
        if (prizeAmount === null) throw new PaisParseError(`${game} tier ${tier}: bad amount "${cells[2]}"`);
        prizeTiers.push({ game, tier, winnersCount, prizeAmount });
      });
  });

  for (const game of ['lotto', 'double', 'extra'] as const) {
    if (!seenGames.has(game)) throw new PaisParseError(`prize table "${game}" not found`);
    if (!prizeTiers.some((t) => t.game === game)) throw new PaisParseError(`prize table "${game}" has no rows`);
  }

  return { drawNumber, drawDate, numbers, strong, extraDigits, prizeTiers };
}

// ─── getNextLotteryDate.ashx?type=1 ──────────────────────────────────────────

export interface NextLotteryInfo {
  drawNumber: number;
  /** Sales close (the 22:45 time the site shows). */
  salesCloseAt: Date;
  /** Assumed draw time: sales close plus DRAW_AFTER_CLOSE_MINUTES. */
  drawAt: Date;
}

// TODO verify at terminal: the draw starts ~15 min after sales close (22:45 close, ~23:00 draw).
export const DRAW_AFTER_CLOSE_MINUTES = 15;

/**
 * Parses [{nextLottoryDate, displayDate, displayTime, firstPrize, secondPrize, LotteryNumber}].
 * displayDate "14/11/2026" + displayTime "22:45" (Israel time) is used first; nextLottoryDate
 * (ISO string) is the fallback.
 */
export function parseNextLotteryResponse(json: unknown): NextLotteryInfo {
  const item = Array.isArray(json) ? json[0] : json;
  if (typeof item !== 'object' || item === null) throw new PaisParseError('empty getNextLotteryDate response');
  const rec = item as Record<string, unknown>;

  const drawNumber = Number(rec['LotteryNumber']);
  if (!Number.isInteger(drawNumber) || drawNumber <= 0) throw new PaisParseError('LotteryNumber missing');

  let salesCloseAt: Date | null = null;
  const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(rec['displayDate'] ?? '').trim());
  const tm = /^(\d{1,2}):(\d{2})/.exec(String(rec['displayTime'] ?? '').trim());
  if (dm && tm) {
    const local = `${dm[3]}-${dm[2]!.padStart(2, '0')}-${dm[1]!.padStart(2, '0')}T${tm[1]!.padStart(2, '0')}:${tm[2]}:00`;
    salesCloseAt = fromZonedTime(local, TIMEZONE);
  } else if (typeof rec['nextLottoryDate'] === 'string') {
    const d = new Date(rec['nextLottoryDate']);
    if (!Number.isNaN(d.getTime())) salesCloseAt = d;
  }
  if (!salesCloseAt || Number.isNaN(salesCloseAt.getTime())) throw new PaisParseError('draw date/time not parseable');

  return {
    drawNumber,
    salesCloseAt,
    drawAt: new Date(salesCloseAt.getTime() + DRAW_AFTER_CLOSE_MINUTES * 60_000),
  };
}
