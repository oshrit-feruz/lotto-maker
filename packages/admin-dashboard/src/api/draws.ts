import { api } from './client';
import type { DrawDetail, DrawStatus, DrawSummary, EditResultsBody, Page } from './types';

/** Newest first. Always paged, so the response is `{ items, total, page, pageSize }`. */
export const listDraws = (p: { status?: DrawStatus; page: number; pageSize: number }) =>
  api.get<Page<DrawSummary>>('/admin/draws', p);
export const getDraw = (id: string) => api.get<DrawDetail>(`/admin/draws/${id}`);
export const editDrawResults = (id: string, body: EditResultsBody) =>
  api.put<DrawDetail>(`/admin/draws/${id}/results`, body);
/**
 * `expectedUpdatedAt` is the `updatedAt` of the draw the admin reviewed. If the draw changed since,
 * the backend confirms nothing and answers 409 RESULTS_CHANGED.
 */
export const confirmDraw = (id: string, expectedUpdatedAt: string) =>
  api.post<DrawDetail>(`/admin/draws/${id}/confirm`, { expectedUpdatedAt });
