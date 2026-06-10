export type GameType = 'lotto' | 'chance' | 'seven77' | 'one23';

export type DrawDay = 'tue' | 'thu' | 'sat';

export interface NumbersPayload {
  numbers: number[];
  strongNumber?: number;
}

export interface GameRules {
  pickCount: number;
  poolSize: number;
  strongPoolSize?: number;
  requiresStrongNumber: boolean;
}
