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
    visibleCutoffMinutesBefore: 75,
    hardCutoffMinutesBefore: 60,
  },
  chance: {
    days: ['tue', 'thu', 'sat'],
    drawHour: 21,
    drawMinute: 30,
    visibleCutoffMinutesBefore: 75,
    hardCutoffMinutesBefore: 60,
  },
  seven77: {
    days: ['tue', 'thu', 'sat'],
    drawHour: 20,
    drawMinute: 0,
    visibleCutoffMinutesBefore: 75,
    hardCutoffMinutesBefore: 60,
  },
  one23: {
    days: ['tue', 'thu', 'sat'],
    drawHour: 20,
    drawMinute: 30,
    visibleCutoffMinutesBefore: 75,
    hardCutoffMinutesBefore: 60,
  },
};

export const DRAW_DAY_TO_JS: Record<DrawDay, number> = {
  tue: 2,
  thu: 4,
  sat: 6,
};

export const TIMEZONE = 'Asia/Jerusalem';
