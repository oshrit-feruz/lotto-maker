import { api } from './client';
import type { DrawDetail, DrawStatus, DrawSummary, EditResultsBody } from './types';

export const listDraws = (status?: DrawStatus) => api.get<DrawSummary[]>('/admin/draws', { status });
export const getDraw = (id: string) => api.get<DrawDetail>(`/admin/draws/${id}`);
export const editDrawResults = (id: string, body: EditResultsBody) =>
  api.put<DrawDetail>(`/admin/draws/${id}/results`, body);
export const confirmDraw = (id: string) => api.post<DrawDetail>(`/admin/draws/${id}/confirm`);
