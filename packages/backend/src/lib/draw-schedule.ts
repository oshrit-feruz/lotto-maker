import { addDays, setHours, setMinutes, setSeconds, differenceInMinutes, isBefore } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { DRAW_SCHEDULE, DRAW_DAY_TO_JS, TIMEZONE } from '@lotto-maker/shared';
import type { GameType } from '@lotto-maker/shared';

export interface DrawInfo {
  drawTime: Date;
  visibleCutoff: Date;
  hardCutoff: Date;
}

export function getNextDrawInfo(gameType: GameType, from: Date = new Date()): DrawInfo {
  const schedule = DRAW_SCHEDULE[gameType];
  const nowInTz = toZonedTime(from, TIMEZONE);

  for (let daysAhead = 0; daysAhead <= 7; daysAhead++) {
    const candidate = addDays(nowInTz, daysAhead);
    const candidateDay = candidate.getDay();

    const isDrawDay = schedule.days.some((d) => DRAW_DAY_TO_JS[d] === candidateDay);
    if (!isDrawDay) continue;

    let drawInTz = setSeconds(setMinutes(setHours(candidate, schedule.drawHour), schedule.drawMinute), 0);
    const drawUtc = fromZonedTime(drawInTz, TIMEZONE);

    const visibleCutoff = new Date(drawUtc.getTime() - schedule.visibleCutoffMinutesBefore * 60 * 1000);
    const hardCutoff = new Date(drawUtc.getTime() - schedule.hardCutoffMinutesBefore * 60 * 1000);

    if (isBefore(from, hardCutoff)) {
      return { drawTime: drawUtc, visibleCutoff, hardCutoff };
    }
  }

  throw new Error(`Could not find next draw for game ${gameType}`);
}

export function minutesUntilHardCutoff(gameType: GameType, from: Date = new Date()): number {
  const { hardCutoff } = getNextDrawInfo(gameType, from);
  return differenceInMinutes(hardCutoff, from);
}
