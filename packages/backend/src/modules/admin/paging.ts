import { z } from 'zod';

export const ADMIN_LIST_DEFAULT_PAGE_SIZE = 50;
export const ADMIN_LIST_MAX_PAGE_SIZE = 200;

/** `page` (from 1) and `pageSize` (1–200, default 50) query params of the admin money lists. */
export const pagingQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(ADMIN_LIST_MAX_PAGE_SIZE).default(ADMIN_LIST_DEFAULT_PAGE_SIZE),
});

export interface Paging {
  page: number;
  pageSize: number;
}

export interface Paged<T> extends Paging {
  items: T[];
  total: number;
}

/** Prisma `skip` / `take` for a page. */
export function pageWindow({ page, pageSize }: Paging): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export const DEFAULT_PAGING: Paging = { page: 1, pageSize: ADMIN_LIST_DEFAULT_PAGE_SIZE };
