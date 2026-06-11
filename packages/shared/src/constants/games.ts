import type { GameRules, GameType } from '../types/game.js';

export const GAME_RULES: Record<GameType, GameRules> = {
  lotto: {
    pickCount: 6,
    poolSize: 37,
    strongPoolSize: 7,
    requiresStrongNumber: true,
  },
  chance: {
    pickCount: 6,
    poolSize: 37,
    strongPoolSize: 7,
    requiresStrongNumber: true,
  },
  seven77: {
    pickCount: 7,
    poolSize: 70,
    requiresStrongNumber: false,
  },
  one23: {
    pickCount: 3,
    poolSize: 9,
    requiresStrongNumber: false,
  },
};

export const GAME_DISPLAY_NAMES: Record<GameType, string> = {
  lotto: 'לוטו',
  chance: "צ'אנס",
  seven77: '777',
  one23: '123',
};

export const GAME_BASE_PRICE: Record<GameType, number> = {
  lotto: 5.9,
  chance: 5.9,
  seven77: 8.0,
  one23: 3.0,
};

export const SERVICE_FEE = 2.5;
