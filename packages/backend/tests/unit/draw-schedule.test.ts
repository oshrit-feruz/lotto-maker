import { describe, it, expect } from 'vitest';
import { getNextDrawInfo } from '../../src/lib/draw-schedule.js';

describe('getNextDrawInfo', () => {
  it('gives the same draw instant (whole minute) for both Vercel subscription runs of one day', () => {
    // Tuesday: the 12:45 and 13:45 UTC cron runs, with different seconds and milliseconds
    const first = getNextDrawInfo('lotto', new Date('2026-11-24T12:45:00.123Z'));
    const second = getNextDrawInfo('lotto', new Date('2026-11-24T13:45:07.456Z'));
    expect(second.drawTime.getTime()).toBe(first.drawTime.getTime());
    expect(first.drawTime.getUTCSeconds()).toBe(0);
    expect(first.drawTime.getUTCMilliseconds()).toBe(0);
  });
});
