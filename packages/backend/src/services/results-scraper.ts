import axios, { AxiosError } from 'axios';
import { load } from 'cheerio';
import { parse as parseDate, isSameDay } from 'date-fns';
import type { GameType, DrawResult } from '@lotto-maker/shared';
import { GAME_RULES } from '@lotto-maker/shared';
import { config } from '../config.js';

// ─── Error types ─────────────────────────────────────────────────────────────
// The scheduler retries ScraperNetworkError but NOT ScraperValidationError.

export class ScraperNetworkError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ScraperNetworkError';
  }
}

export class ScraperValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScraperValidationError';
  }
}

// ─── Per-game HTML parse config ───────────────────────────────────────────────

interface ParseConfig {
  /** CSS selector for the <li> result item inside the showMoreResults fragment */
  itemSelector: string;
  /** Selector for the draw-number text node (relative to item) */
  drawNumSelector: string;
  /** Selector for the date text node (DD/MM/YY format, relative to item) */
  dateSelector: string;
  /** Selector for each winning-number <div> (relative to item) */
  mainNumSelector: string;
  /** Selector for the strong-number <div>, or null when not applicable */
  strongSelector: string | null;
  /**
   * Chance is a playing-card game; its results cannot be mapped to number[].
   * The existing GAME_RULES.chance entry (pickCount:6, poolSize:37) does not
   * reflect the real game — scraping is intentionally unsupported until the
   * data model is reconciled.
   */
  isCardGame?: boolean;
}

const PARSE_CONFIG: Record<GameType, ParseConfig> = {
  lotto: {
    itemSelector: 'li.archive_list_item:not(.chance)',
    drawNumSelector: '.archive_list_block.lotto_number > div',
    dateSelector: '.archive_list_block.date:not(.chance) > div:first-child',
    mainNumSelector: 'ol.cat_data_info.archive li.loto_info_num.archive > div',
    strongSelector: '.loto_info_num.strong.archive > div',
  },
  // Chance returns 4 playing cards (suit + value), not 6 numeric picks.
  // Until the shared game model is updated to represent cards, scraping
  // will throw ScraperValidationError rather than produce garbage data.
  chance: {
    itemSelector: 'li.archive_list_item.chance',
    drawNumSelector: '.archive_list_block.chance_number > div',
    dateSelector: '.archive_list_block.date.chance > div:first-child',
    mainNumSelector: '.cat_data_info.chance.archive',
    strongSelector: null,
    isCardGame: true,
  },
  // 777 and 123 follow the same HTML structure as lotto.
  // CSS class names for the draw-number block are best-guess from the
  // site's naming convention; verify against a live fetch if they change.
  seven77: {
    itemSelector: 'li.archive_list_item:not(.chance)',
    drawNumSelector: '.archive_list_block.seven_number > div',
    dateSelector: '.archive_list_block.date:not(.chance) > div:first-child',
    mainNumSelector: 'ol.cat_data_info.archive li.loto_info_num.archive > div',
    strongSelector: null,
  },
  one23: {
    itemSelector: 'li.archive_list_item:not(.chance)',
    drawNumSelector: '.archive_list_block.one23_number > div',
    dateSelector: '.archive_list_block.date:not(.chance) > div:first-child',
    mainNumSelector: 'ol.cat_data_info.archive li.loto_info_num.archive > div',
    strongSelector: null,
  },
};

/** URL path segment per game type (maps GameType → pais.co.il path) */
const URL_PATH: Record<GameType, string> = {
  lotto: 'lotto',
  chance: 'chance',
  seven77: '777',
  one23: '123',
};

/**
 * Number of winning balls in the DRAW RESULT, which differs from the player's
 * pickCount in GAME_RULES.  777 (Keno-style): Pais draws 17 balls from 1-70;
 * a player picks 7 and wins based on how many of their picks appear in those 17.
 */
const DRAW_RESULT_COUNTS: Partial<Record<GameType, number>> = {
  seven77: 17,
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ─── ResultsScraper ───────────────────────────────────────────────────────────

export class ResultsScraper {
  constructor(private readonly baseUrl = config.PAIS_BASE_URL.replace(/\/$/, '')) {}

  /** Fetch and parse the most recent completed draw for a game. */
  async fetchLatestResult(gameType: GameType): Promise<DrawResult> {
    const html = await this.getArchiveHtml(gameType, 1, 1);
    return this.parseHtml(html, gameType);
  }

  /**
   * Fetch a specific draw by its sequential draw number.
   * Uses the latest result and confirms the draw number matches.
   * For historical draws (not the most recent), extend this method to
   * paginate through showMoreResults.aspx with higher fromIndex values.
   */
  async fetchDrawResult(gameType: GameType, drawNumber: number): Promise<DrawResult> {
    const html = await this.getArchiveHtml(gameType, 1, 1);
    const result = this.parseHtml(html, gameType);
    if (result.drawNumber !== drawNumber) {
      throw new ScraperValidationError(
        `Expected draw #${drawNumber} but latest is #${result.drawNumber} for ${gameType}`,
      );
    }
    return result;
  }

  /**
   * Parse an HTML fragment returned by showMoreResults.aspx.
   * Exposed for unit testing; production code calls fetchLatestResult /
   * fetchDrawResult which call this internally.
   */
  parseHtml(html: string, gameType: GameType): DrawResult {
    const cfg = PARSE_CONFIG[gameType];

    if (cfg.isCardGame) {
      throw new ScraperValidationError(
        `${gameType} is a card game — results cannot be represented as winningNumbers. ` +
        `Update the shared DrawResult model before enabling Chance scraping.`,
      );
    }

    const $ = load(html);
    const item = $(cfg.itemSelector).first();

    if (!item.length) {
      throw new ScraperValidationError(
        `No result item found in HTML for ${gameType} (selector: "${cfg.itemSelector}")`,
      );
    }

    // Draw number
    const drawNumText = item.find(cfg.drawNumSelector).first().text().trim();
    const drawNumber = parseInt(drawNumText, 10);
    if (isNaN(drawNumber) || drawNumber <= 0) {
      throw new ScraperValidationError(
        `${gameType}: invalid draw number "${drawNumText}"`,
      );
    }

    // Date — Pais emits DD/MM/YY (two-digit year, Israel calendar)
    const dateText = item.find(cfg.dateSelector).first().text().trim();
    let drawDate: Date;
    try {
      drawDate = parseDate(dateText, 'dd/MM/yy', new Date());
      if (isNaN(drawDate.getTime())) throw new Error('Invalid date');
    } catch {
      throw new ScraperValidationError(
        `${gameType}: cannot parse date "${dateText}" (expected DD/MM/YY)`,
      );
    }

    // Winning numbers
    const winningNumbers: number[] = [];
    item.find(cfg.mainNumSelector).each((_i, el) => {
      const n = parseInt($(el).text().trim(), 10);
      if (!isNaN(n)) winningNumbers.push(n);
    });

    // Strong number (optional)
    let strongNumber: number | undefined;
    if (cfg.strongSelector) {
      const strongText = item.find(cfg.strongSelector).first().text().trim();
      const s = parseInt(strongText, 10);
      if (!isNaN(s) && s > 0) strongNumber = s;
    }

    // Validate counts + ranges against shared game rules
    this.validateNumbers(gameType, winningNumbers, strongNumber);

    return { drawNumber, gameType, winningNumbers, strongNumber, drawDate };
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private async getArchiveHtml(
    gameType: GameType,
    fromIndex: number,
    amount: number,
  ): Promise<string> {
    const path = URL_PATH[gameType];
    const url =
      `${this.baseUrl}/${path}/showMoreResults.aspx` +
      `?fromIndex=${fromIndex}&amount=${amount}`;

    try {
      const response = await axios.get<string>(url, {
        timeout: 10_000,
        headers: { 'User-Agent': USER_AGENT },
        responseType: 'text',
      });
      return response.data;
    } catch (err) {
      if (err instanceof AxiosError) {
        const detail = err.response
          ? `HTTP ${err.response.status}`
          : (err.code ?? 'no response');
        throw new ScraperNetworkError(
          `Network error fetching ${gameType} results (${detail})`,
          err,
        );
      }
      throw new ScraperNetworkError(
        `Unexpected error fetching ${gameType} results`,
        err,
      );
    }
  }

  private validateNumbers(
    gameType: GameType,
    numbers: number[],
    strongNumber?: number,
  ): void {
    const rules = GAME_RULES[gameType];
    // Use draw-result count when it differs from the player's pick count (e.g. 777 draws 17 balls)
    const expectedCount = DRAW_RESULT_COUNTS[gameType] ?? rules.pickCount;

    if (numbers.length !== expectedCount) {
      throw new ScraperValidationError(
        `${gameType}: expected ${expectedCount} numbers in draw result, got ${numbers.length}`,
      );
    }

    for (const n of numbers) {
      if (n < 1 || n > rules.poolSize) {
        throw new ScraperValidationError(
          `${gameType}: number ${n} out of range [1, ${rules.poolSize}]`,
        );
      }
    }

    const unique = new Set(numbers);
    if (unique.size !== numbers.length) {
      throw new ScraperValidationError(`${gameType}: duplicate numbers in result`);
    }

    if (rules.requiresStrongNumber) {
      if (strongNumber === undefined) {
        throw new ScraperValidationError(
          `${gameType}: strong number required but not found`,
        );
      }
      const maxStrong = rules.strongPoolSize ?? rules.poolSize;
      if (strongNumber < 1 || strongNumber > maxStrong) {
        throw new ScraperValidationError(
          `${gameType}: strong number ${strongNumber} out of range [1, ${maxStrong}]`,
        );
      }
    }
  }
}

export const resultsScraper = new ResultsScraper();

/**
 * Convenience wrapper used by results.service.ts.
 * Returns null when the latest scraped result is not for the expected draw
 * date (results not yet posted for this draw).
 * Propagates ScraperNetworkError (retriable) and ScraperValidationError (not retriable).
 */
export async function fetchLatestForDate(
  gameType: GameType,
  drawDate: Date,
): Promise<DrawResult | null> {
  const result = await resultsScraper.fetchLatestResult(gameType);
  if (!isSameDay(result.drawDate, drawDate)) {
    return null;
  }
  return result;
}
