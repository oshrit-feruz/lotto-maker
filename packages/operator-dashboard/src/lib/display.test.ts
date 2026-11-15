import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colors, fonts } from '@lotto-maker/shared';
import type { QueueSlotWithOrder } from '../api/client.js';
import { SLOT_STATUS_LABEL, pad2, slotTitle, systematicLabel } from './display.js';

const order = (o: Partial<QueueSlotWithOrder['order']>): QueueSlotWithOrder['order'] => ({
  gameType: 'lotto',
  type: 'single',
  drawNumber: 3984,
  ticketType: 'regular',
  systematicType: null,
  extra: false,
  tables: [],
  idLast4: null,
  ...o,
});

describe('slotTitle', () => {
  it('names the game, double and Extra as before the redesign', () => {
    expect(slotTitle(order({}))).toBe('לוטו');
    expect(slotTitle(order({ ticketType: 'double', extra: true }))).toBe('לוטו כפול + Extra');
    expect(slotTitle(order({ gameType: 'unknown_game' }))).toBe('unknown_game');
  });
});

describe('systematicLabel', () => {
  it('uses the Hebrew label of a known rule and falls back to the id', () => {
    expect(systematicLabel('full_8')).toBe('שיטתי 8');
    expect(systematicLabel('mystery')).toBe('mystery');
    expect(systematicLabel(null)).toBeNull();
  });
});

describe('display helpers', () => {
  it('labels every queue status the backend returns', () => {
    for (const s of ['waiting', 'in_progress', 'done']) expect(SLOT_STATUS_LABEL[s]).toBeTruthy();
  });
  it('pads the countdown', () => {
    expect(pad2(4)).toBe('04');
    expect(pad2(12)).toBe('12');
  });
});

describe('design tokens', () => {
  const here = fileURLToPath(new URL('./', import.meta.url));
  const read = (p: string) => readFileSync(join(here, p), 'utf8');

  it('styles.css imports the shared tokens and this app declares their fonts', () => {
    expect(read('../styles.css')).toContain("@import '../../shared/src/design/tokens.css';");
    const fontsCss = read('../fonts.css');
    for (const family of [fonts.display, fonts.body, fonts.shekel]) expect(fontsCss).toContain(`font-family: '${family}';`);
  });

  it('the PWA theme colours come from the tokens', () => {
    const vite = read('../../vite.config.ts');
    expect(vite).toContain(`theme_color: '${colors.pine}'`);
    expect(vite).toContain(`background_color: '${colors.paper}'`);
  });
});
