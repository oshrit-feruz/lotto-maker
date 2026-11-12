import { z } from 'zod';

/**
 * The reason an admin gives for a review decision. It is trimmed first, so a blank or
 * whitespace-only reason fails the minimum length instead of being stored and audited.
 */
export const reviewReasonSchema = z.string().trim().min(2).max(500);
