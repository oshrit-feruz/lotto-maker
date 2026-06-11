import { GAME_RULES } from '@lotto-maker/shared';
import type { GameType } from '@lotto-maker/shared';
import { AppError } from '../../plugins/error-handler.js';

export function validateGameNumbers(
  gameType: GameType,
  numbers: number[],
  strongNumber?: number,
): void {
  const rules = GAME_RULES[gameType];

  if (numbers.length !== rules.pickCount) {
    throw new AppError(
      400,
      'INVALID_NUMBERS',
      `${gameType} requires exactly ${rules.pickCount} numbers`,
    );
  }

  const uniqueNumbers = new Set(numbers);
  if (uniqueNumbers.size !== numbers.length) {
    throw new AppError(400, 'INVALID_NUMBERS', 'Numbers must be unique');
  }

  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || n > rules.poolSize) {
      throw new AppError(
        400,
        'INVALID_NUMBERS',
        `Numbers must be integers between 1 and ${rules.poolSize}`,
      );
    }
  }

  if (rules.requiresStrongNumber) {
    if (strongNumber === undefined) {
      throw new AppError(400, 'INVALID_NUMBERS', `${gameType} requires a strong number`);
    }
    if (!Number.isInteger(strongNumber) || strongNumber < 1 || strongNumber > (rules.strongPoolSize ?? Infinity)) {
      throw new AppError(
        400,
        'INVALID_NUMBERS',
        `Strong number must be between 1 and ${rules.strongPoolSize}`,
      );
    }
  }
}
