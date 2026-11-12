import { api } from './client';
import type { AuditEntry, Page } from './types';

// Contract only – not implemented in the backend yet.
export const listAudit = (p: { action?: string; from?: string; to?: string; page: number; pageSize: number }) =>
  api.get<Page<AuditEntry>>('/admin/audit', p);
