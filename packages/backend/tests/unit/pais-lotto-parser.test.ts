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
// The real page for draw 3983, captured from pais.co.il (pruned to the results region).
const HTML = readFileSync(resolve(__dirname, '../fixtures/pais-current-lotto-3983-real.html'), 'utf8');

describe('parseCurrentLotto – real draw 3983 page', () => {
  const draw = parseCurrentLotto(HTML);
  const find = (game: string, tier: string) => draw.prizeTiers.find((t) => t.game === game && t.tier === tier);

  it('reads number, date, numbers, strong and Extra digits', () => {
    expect(draw.drawNumber).toBe(3983);
    expect(draw.drawDate).toBe('2026-11-10');
    expect(draw.numbers).toEqual([4, 10, 15, 21, 35, 37]);
    expect(draw.strong).toBe(2);
    // the empty .loto_info_num.extra before the digits is skipped
    expect(draw.extraDigits).toEqual([5, 7, 4, 3, 2, 4]);
  });

  it('reads all three prize tables', () => {
    const count = (g: string) => draw.prizeTiers.filter((t) => t.game === g).length;
    expect(count('lotto')).toBe(8);
    expect(count('double')).toBe(8);
    expect(count('extra')).toBe(5);
    expect(draw.prizeTiers).toHaveLength(21);
  });

  // tier, lotto winners / ₪, double winners / ₪
  const LOTTO_DOUBLE: Array<[string, number, string, number, string]> = [
    ['6+s', 0, '0.00', 0, '0.00'],
    ['6', 0, '0.00', 0, '0.00'],
    ['5+s', 15, '5645.00', 12, '11290.00'],
    ['5', 88, '959.00', 58, '1918.00'],
    ['4+s', 731, '158.00', 462, '316.00'],
    ['4', 4233, '55.00', 2675, '110.00'],
    ['3+s', 9496, '40.00', 6034, '80.00'],
    ['3', 57052, '10.00', 36057, '20.00'],
  ];
  it.each(LOTTO_DOUBLE)('tier %s: lotto %i / %s, double %i / %s', (tier, lw, la, dw, da) => {
    expect(find('lotto', tier)).toEqual({ game: 'lotto', tier, winnersCount: lw, prizeAmount: la });
    expect(find('double', tier)).toEqual({ game: 'double', tier, winnersCount: dw, prizeAmount: da });
  });

  it('Extra: tiers keyed by matching digits, with winners and fixed prizes', () => {
    const extra = draw.prizeTiers.filter((t) => t.game === 'extra').map((t) => [t.tier, t.winnersCount, t.prizeAmount]);
    expect(extra).toEqual([
      ['6', 2, '60000.00'],
      ['5', 52, '1000.00'],
      ['4', 718, '75.00'],
      ['3', 5847, '15.00'],
      ['2', 25956, '10.00'],
    ]);
  });
});

describe('parseCurrentLotto – bad input', () => {
  it('throws PaisParseError when the page has no result', () => {
    expect(() => parseCurrentLotto('<html><body>nothing</body></html>')).toThrow(PaisParseError);
  });
  it('throws when a number is out of range', () => {
    expect(() =>
      parseCurrentLotto(HTML.replace('<li class="loto_info_num"><div>37</div></li>', '<li class="loto_info_num"><div>38</div></li>')),
    ).toThrow(PaisParseError);
  });
  it('throws when a prize table is missing', () => {
    const broken = HTML.replace('class="current_loto_table extra"', 'class="current_loto_table other"').replace(
      'טבלת זכיות אקסטרא',
      'טבלת זכיות אחרת',
    );
    expect(() => parseCurrentLotto(broken)).toThrow(/extra/);
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
