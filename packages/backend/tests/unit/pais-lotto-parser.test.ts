import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  parseCurrentLotto,
  parseNextLotteryResponse,
  normalizeTier,
  PaisParseError,
} from '../../src/services/pais-lotto-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// NOTE: synthetic fixture, see its header. Only the two 5+strong rows come from the issue.
const HTML = readFileSync(resolve(__dirname, '../fixtures/pais-current-lotto-3983.html'), 'utf8');

describe('parseCurrentLotto – draw 3983 fixture', () => {
  const draw = parseCurrentLotto(HTML);

  it('reads number, date, numbers, strong and Extra digits', () => {
    expect(draw.drawNumber).toBe(3983);
    expect(draw.drawDate).toBe('2026-11-10');
    expect(draw.numbers).toEqual([4, 11, 19, 23, 30, 36]);
    expect(draw.strong).toBe(5);
    expect(draw.extraDigits).toEqual([3, 1, 7, 2, 5, 6]);
  });

  it('reads all three prize tables', () => {
    const count = (g: string) => draw.prizeTiers.filter((t) => t.game === g).length;
    expect(count('lotto')).toBe(8);
    expect(count('double')).toBe(8);
    expect(count('extra')).toBe(5);
  });

  it('lotto 5+strong: 15 winners at 5,645 ₪; double: 12 winners at 11,290 ₪ (values from the issue)', () => {
    const find = (game: string, tier: string) => draw.prizeTiers.find((t) => t.game === game && t.tier === tier);
    expect(find('lotto', '5+s')).toEqual({ game: 'lotto', tier: '5+s', winnersCount: 15, prizeAmount: '5645.00' });
    expect(find('double', '5+s')).toEqual({ game: 'double', tier: '5+s', winnersCount: 12, prizeAmount: '11290.00' });
  });

  it('a tier with no winners and a dash for amount is 0', () => {
    expect(draw.prizeTiers.find((t) => t.game === 'lotto' && t.tier === '6+s')).toMatchObject({
      winnersCount: 0,
      prizeAmount: '0.00',
    });
  });

  it('Extra tiers are keyed by matching digits', () => {
    expect(draw.prizeTiers.filter((t) => t.game === 'extra').map((t) => t.tier)).toEqual(['6', '5', '4', '3', '2']);
  });
});

describe('parseCurrentLotto – bad input', () => {
  it('throws PaisParseError when the page has no result', () => {
    expect(() => parseCurrentLotto('<html><body>nothing</body></html>')).toThrow(PaisParseError);
  });
  it('throws when a number is out of range', () => {
    expect(() => parseCurrentLotto(HTML.replace('<span class="num">36</span>', '<span class="num">38</span>'))).toThrow(
      PaisParseError,
    );
  });
  it('throws when a prize table is missing', () => {
    expect(() => parseCurrentLotto(HTML.replace('<caption>אקסטרה</caption>', '<caption>אחר</caption>'))).toThrow(
      /extra/,
    );
  });
});

describe('normalizeTier', () => {
  it('maps labels to tier keys', () => {
    expect(normalizeTier('lotto', '5 + חזק')).toBe('5+s');
    expect(normalizeTier('lotto', '3')).toBe('3');
    expect(normalizeTier('lotto', 'סה"כ')).toBeNull();
    expect(normalizeTier('extra', '2 ספרות')).toBe('2');
  });
});

describe('parseNextLotteryResponse', () => {
  it('uses displayDate + displayTime in Israel time (draw 3984: 14/11/2026 22:45)', () => {
    const info = parseNextLotteryResponse([
      { nextLottoryDate: '2026-11-14T22:45:00', displayDate: '14/11/2026', displayTime: '22:45', LotteryNumber: 3984 },
    ]);
    expect(info.drawNumber).toBe(3984);
    // 22:45 Israel in November is UTC+2
    expect(info.salesCloseAt.toISOString()).toBe('2026-11-14T20:45:00.000Z');
    expect(info.drawAt.toISOString()).toBe('2026-11-14T21:00:00.000Z');
  });
  it('rejects an empty response', () => {
    expect(() => parseNextLotteryResponse([])).toThrow(PaisParseError);
  });
});
