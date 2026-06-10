import type { GameType, DrawDay } from '../types/game.js';

export interface DrawScheduleEntry {
  days: DrawDay[];
  drawHour: number;
  drawMinute: number;
  visibleCutoffMinutesBefore: number;
  hardCutoffMinutesBefore: number;
}

export const DRAW_SCHEDULE: Record<GameType, DrawScheduleEntry> = {
  lotto: {
    days: ['tue', 'thu', 'sat'],
    drawHour: 21,
    drawMinute: 0,
    visibleCutoffMinutesBefore: 60,
    hardCutoffMinutesBefore: 75,
  },
  chance: {
    days: ['tue', 'thu', 'sat'],
    drawHour: 21,
    drawMinute: 30,
    visibleCutoffMinutesBefore: 60,
    hardCutoffMinutesBefore: 75,
  },
  seven77: {
    days: ['tue', 'thu', 'sat'],
    drawHour: 20,
    drawMinute: 0,
    visibleCutoffMinutesBefore: 60,
    hardCutoffMinutesBefore: 75,
  },
  one23: {
    days: ['tue', 'thu', 'sat'],
    drawHour: 20,
    drawMinute: 30,
    visibleCutoffMinutesBefore: 60,
    hardCutoffMinutesBefore: 75,
  },
};

export const DRAW_DAY_TO_JS: Record<DrawDay, number> = {
  tue: 2,
  thu: 4,
  sat: 6,
};

export const TIMEZONE = 'Asia/Jerusalem';
