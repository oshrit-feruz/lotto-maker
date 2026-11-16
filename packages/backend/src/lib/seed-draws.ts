/**
 * Draws created by the dev seed (prisma/seed.ts) are numbered from SEED_DRAW_NUMBER_BASE + 1, so
 * they never look like a real pais draw number. Pais has no results for them, so the results job
 * skips them. No imports here: seed.ts loads this file directly.
 */
export const SEED_DRAW_NUMBER_BASE = 900_000;
