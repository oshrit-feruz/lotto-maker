import type { GameType } from './game.js';

export interface DrawResult {
  drawNumber: number;
  gameType: GameType;
  winningNumbers: number[];
  strongNumber?: number;
  drawDate: Date;
}
