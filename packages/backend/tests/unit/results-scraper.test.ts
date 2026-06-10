import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ResultsScraper,
  ScraperNetworkError,
  ScraperValidationError,
} from '../../src/services/results-scraper.js';

// ─── Axios mock ───────────────────────────────────────────────────────────────
// vi.mock is hoisted to the top of the file, so mockGet must be declared with
// vi.hoisted to avoid "Cannot access before initialization" errors.
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('axios', () => {
  class AxiosError extends Error {
    code?: string;
    response?: { status: number };
    constructor(msg: string, code?: string) {
      super(msg);
      this.name = 'AxiosError';
      this.code = code;
    }
  }
  return { default: { get: mockGet }, AxiosError };
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const LOTTO_FIXTURE = readFileSync(
  resolve(__dirname, '../fixtures/pais-lotto-response.html'),
  'utf8',
);

const CHANCE_FIXTURE = `
<li class="archive_list_item chance">
  <div class="archive_list_block chance_number"><div>53034</div></div>
  <div class="archive_list_block date chance"><div>10/06/26</div><div>13:00</div></div>
  <div class="archive_list_block card">
    <div class="cat_data_info chance archive">
      <div class="chance_card_icon archive"><img src="/images/ic_card_clubs.png" alt="תלתן"></div>
      <div>8</div>
    </div>
    <div class="cat_data_info chance archive red">
      <div class="chance_card_icon archive"><img src="/images/ic_card_diamond.png" alt="יהלום"></div>
      <div>A</div>
    </div>
  </div>
</li>`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeAxiosResponse(data: string) {
  return { data, status: 200, headers: {} };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('ResultsScraper', () => {
  let scraper: ResultsScraper;

  beforeEach(() => {
    vi.clearAllMocks();
    scraper = new ResultsScraper('https://www.pais.co.il');
  });

  // ─── parseHtml — valid Lotto fixture ───────────────────────────────────────

  describe('parseHtml — lotto fixture', () => {
    it('extracts draw number correctly', () => {
      const result = scraper.parseHtml(LOTTO_FIXTURE, 'lotto');
      expect(result.drawNumber).toBe(3934);
    });

    it('extracts all six winning numbers', () => {
      const result = scraper.parseHtml(LOTTO_FIXTURE, 'lotto');
      expect(result.winningNumbers).toEqual([11, 19, 20, 29, 31, 35]);
    });

    it('extracts the strong number', () => {
      const result = scraper.parseHtml(LOTTO_FIXTURE, 'lotto');
      expect(result.strongNumber).toBe(2);
    });

    it('parses the draw date as June 9 2026', () => {
      const result = scraper.parseHtml(LOTTO_FIXTURE, 'lotto');
      expect(result.drawDate.getFullYear()).toBe(2026);
      expect(result.drawDate.getMonth()).toBe(5); // 0-indexed → June
      expect(result.drawDate.getDate()).toBe(9);
    });

    it('sets gameType to lotto', () => {
      const result = scraper.parseHtml(LOTTO_FIXTURE, 'lotto');
      expect(result.gameType).toBe('lotto');
    });
  });

  // ─── parseHtml — validation errors ────────────────────────────────────────

  describe('parseHtml — validation errors', () => {
    it('throws ScraperValidationError when fewer than 6 numbers are present', () => {
      const html = LOTTO_FIXTURE
        .replace('<li class="loto_info_num archive"><div>35</div></li>', ''); // remove last number
      expect(() => scraper.parseHtml(html, 'lotto')).toThrowError(ScraperValidationError);
    });

    it('throws ScraperValidationError when a number is out of range (> 37)', () => {
      const html = LOTTO_FIXTURE.replace('<div>35</div>', '<div>99</div>');
      expect(() => scraper.parseHtml(html, 'lotto')).toThrowError(ScraperValidationError);
    });

    it('throws ScraperValidationError when duplicate numbers appear', () => {
      const html = LOTTO_FIXTURE.replace('<div>35</div>', '<div>11</div>');
      expect(() => scraper.parseHtml(html, 'lotto')).toThrowError(ScraperValidationError);
    });

    it('throws ScraperValidationError when strong number is missing for lotto', () => {
      const html = LOTTO_FIXTURE
        .replace(/<div class="loto_info_num strong archive">[\s\S]*?<\/div>\s*<\/div>/, '');
      expect(() => scraper.parseHtml(html, 'lotto')).toThrowError(ScraperValidationError);
    });

    it('throws ScraperValidationError with message describing the problem', () => {
      const html = LOTTO_FIXTURE.replace('<div>35</div>', '<div>99</div>');
      expect(() => scraper.parseHtml(html, 'lotto')).toThrow(/out of range/);
    });

    it('throws ScraperValidationError when HTML contains no result item', () => {
      expect(() => scraper.parseHtml('<html><body>no results</body></html>', 'lotto'))
        .toThrowError(ScraperValidationError);
    });
  });

  // ─── parseHtml — Chance (card game) ───────────────────────────────────────

  describe('parseHtml — Chance', () => {
    it('throws ScraperValidationError because Chance is a card game', () => {
      expect(() => scraper.parseHtml(CHANCE_FIXTURE, 'chance'))
        .toThrowError(ScraperValidationError);
    });

    it('includes an informative message about the card game limitation', () => {
      expect(() => scraper.parseHtml(CHANCE_FIXTURE, 'chance'))
        .toThrow(/card game/i);
    });
  });

  // ─── fetchLatestResult — integration (axios mocked) ────────────────────────

  describe('fetchLatestResult', () => {
    it('returns a DrawResult when axios responds with valid HTML', async () => {
      mockGet.mockResolvedValueOnce(makeAxiosResponse(LOTTO_FIXTURE));
      const result = await scraper.fetchLatestResult('lotto');
      expect(result.drawNumber).toBe(3934);
      expect(result.winningNumbers).toHaveLength(6);
    });

    it('calls the correct Pais URL', async () => {
      mockGet.mockResolvedValueOnce(makeAxiosResponse(LOTTO_FIXTURE));
      await scraper.fetchLatestResult('lotto');
      expect(mockGet).toHaveBeenCalledWith(
        'https://www.pais.co.il/lotto/showMoreResults.aspx?fromIndex=1&amount=1',
        expect.objectContaining({ timeout: 10_000 }),
      );
    });

    it('throws ScraperNetworkError on axios network failure', async () => {
      const { AxiosError } = await import('axios');
      const netErr = new (AxiosError as unknown as new (msg: string, code: string) => Error)(
        'ECONNREFUSED',
        'ECONNREFUSED',
      );
      mockGet.mockRejectedValueOnce(netErr);
      await expect(scraper.fetchLatestResult('lotto')).rejects.toThrowError(ScraperNetworkError);
    });

    it('throws ScraperNetworkError on HTTP 5xx', async () => {
      const { AxiosError } = await import('axios');
      const httpErr = Object.assign(
        new (AxiosError as unknown as new (msg: string) => Error)('Request failed'),
        { response: { status: 503 } },
      );
      mockGet.mockRejectedValueOnce(httpErr);
      await expect(scraper.fetchLatestResult('lotto')).rejects.toThrowError(ScraperNetworkError);
    });

    it('uses User-Agent header in the request', async () => {
      mockGet.mockResolvedValueOnce(makeAxiosResponse(LOTTO_FIXTURE));
      await scraper.fetchLatestResult('lotto');
      const [, options] = mockGet.mock.calls[0] as [string, { headers: Record<string, string> }];
      expect(options.headers['User-Agent']).toMatch(/Mozilla/);
    });
  });

  // ─── fetchDrawResult ────────────────────────────────────────────────────────

  describe('fetchDrawResult', () => {
    it('returns a DrawResult when the latest draw matches the requested number', async () => {
      mockGet.mockResolvedValueOnce(makeAxiosResponse(LOTTO_FIXTURE));
      const result = await scraper.fetchDrawResult('lotto', 3934);
      expect(result.drawNumber).toBe(3934);
    });

    it('throws ScraperValidationError when the draw number does not match', async () => {
      mockGet.mockResolvedValueOnce(makeAxiosResponse(LOTTO_FIXTURE));
      await expect(scraper.fetchDrawResult('lotto', 9999)).rejects.toThrowError(
        ScraperValidationError,
      );
    });
  });

  // ─── URL path per game type ────────────────────────────────────────────────

  describe('URL path mapping', () => {
    it('uses /777/ path for seven77', async () => {
      // seven77 has 7 numbers — build a minimal fixture
      const html = `
        <li class="archive_list_item">
          <div class="archive_list_block seven_number"><div>1234</div></div>
          <div class="archive_list_block date"><div>09/06/26</div><div>21:00</div></div>
          <div class="archive_list_block numbers">
            <ol class="cat_data_info archive">
              <li class="loto_info_num archive"><div>1</div></li>
              <li class="loto_info_num archive"><div>5</div></li>
              <li class="loto_info_num archive"><div>10</div></li>
              <li class="loto_info_num archive"><div>20</div></li>
              <li class="loto_info_num archive"><div>30</div></li>
              <li class="loto_info_num archive"><div>40</div></li>
              <li class="loto_info_num archive"><div>50</div></li>
            </ol>
          </div>
        </li>`;
      mockGet.mockResolvedValueOnce(makeAxiosResponse(html));
      await scraper.fetchLatestResult('seven77');
      const [url] = mockGet.mock.calls[0] as [string];
      expect(url).toContain('/777/showMoreResults.aspx');
    });

    it('uses /123/ path for one23', async () => {
      const html = `
        <li class="archive_list_item">
          <div class="archive_list_block one23_number"><div>567</div></div>
          <div class="archive_list_block date"><div>09/06/26</div><div>20:30</div></div>
          <div class="archive_list_block numbers">
            <ol class="cat_data_info archive">
              <li class="loto_info_num archive"><div>3</div></li>
              <li class="loto_info_num archive"><div>6</div></li>
              <li class="loto_info_num archive"><div>9</div></li>
            </ol>
          </div>
        </li>`;
      mockGet.mockResolvedValueOnce(makeAxiosResponse(html));
      await scraper.fetchLatestResult('one23');
      const [url] = mockGet.mock.calls[0] as [string];
      expect(url).toContain('/123/showMoreResults.aspx');
    });
  });
});
