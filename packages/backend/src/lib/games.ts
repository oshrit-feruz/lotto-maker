import { config } from '../config.js';
import { AppError } from '../plugins/error-handler.js';

export function isGameEnabled(gameType: string): boolean {
  return config.ENABLED_GAMES.includes(gameType);
}

/** New orders are only accepted for games listed in ENABLED_GAMES. */
export function assertGameEnabled(gameType: string): void {
  if (!isGameEnabled(gameType)) {
    throw new AppError(403, 'GAME_NOT_AVAILABLE', `${gameType} is not available`);
  }
}
