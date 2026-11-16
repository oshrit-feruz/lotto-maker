import { api } from './client';
import type { AuditEntry, Page } from './types';

/**
 * `action` is a prefix match (e.g. `user:`). `from` / `to` are bare `YYYY-MM-DD` days in Israel
 * time (`to` includes the whole day) or ISO date-times with an offset.
 */
export const listAudit = (p: { action?: string; from?: string; to?: string; page: number; pageSize: number }) =>
  api.get<Page<AuditEntry>>('/admin/audit', p);
