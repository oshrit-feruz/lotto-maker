import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { DrawSummary, Page } from '../api/types';
import DrawsPage, { DRAWS_PAGE_SIZE } from './DrawsPage';
import * as draws from '../api/draws';

vi.mock('../api/draws', () => ({ listDraws: vi.fn(), getDraw: vi.fn(), editDrawResults: vi.fn(), confirmDraw: vi.fn() }));

const draw = (n: number): DrawSummary => ({
  id: `d${n}`,
  drawNumber: n,
  drawAt: '2026-11-10T19:00:00Z',
  salesCloseAt: '2026-11-10T17:00:00Z',
  status: 'settled',
  suggestedAt: null,
  confirmedAt: null,
  settledAt: null,
  needsAttention: false,
  attentionReason: null,
  updatedAt: '2026-11-10T19:00:00Z',
});

const TOTAL = DRAWS_PAGE_SIZE + 3;
function pageOf(p: { page: number; pageSize: number }): Page<DrawSummary> {
  const start = (p.page - 1) * p.pageSize;
  const count = Math.max(0, Math.min(p.pageSize, TOTAL - start));
  return { items: Array.from({ length: count }, (_, i) => draw(4000 - start - i)), total: TOTAL, page: p.page, pageSize: p.pageSize };
}

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DrawsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DrawsPage pagination', () => {
  beforeEach(() => {
    vi.mocked(draws.listDraws).mockReset();
    vi.mocked(draws.listDraws).mockImplementation(async (p) => pageOf(p));
  });

  it('requests a page and moves with next / previous', async () => {
    renderPage();
    expect(await screen.findByText('4000')).toBeInTheDocument();
    expect(draws.listDraws).toHaveBeenLastCalledWith({ page: 1, pageSize: DRAWS_PAGE_SIZE });
    expect(screen.getByText('עמוד 1 מתוך 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'הקודם' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'הבא' }));
    expect(await screen.findByText(String(4000 - DRAWS_PAGE_SIZE))).toBeInTheDocument();
    expect(draws.listDraws).toHaveBeenLastCalledWith({ page: 2, pageSize: DRAWS_PAGE_SIZE });
    expect(screen.getByText('עמוד 2 מתוך 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'הבא' })).toBeDisabled();
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3);

    await userEvent.click(screen.getByRole('button', { name: 'הקודם' }));
    expect(await screen.findByText('4000')).toBeInTheDocument();
    expect(draws.listDraws).toHaveBeenLastCalledWith({ page: 1, pageSize: DRAWS_PAGE_SIZE });
  });

  it('goes back to page 1 and sends the status when the filter changes', async () => {
    renderPage();
    await screen.findByText('4000');
    await userEvent.click(screen.getByRole('button', { name: 'הבא' }));
    await screen.findByText('עמוד 2 מתוך 2');
    await userEvent.selectOptions(screen.getByLabelText('סטטוס'), 'results_suggested');
    await waitFor(() =>
      expect(draws.listDraws).toHaveBeenLastCalledWith({ status: 'results_suggested', page: 1, pageSize: DRAWS_PAGE_SIZE }),
    );
  });
});

describe('DrawsPage status badge', () => {
  it('shows the raw status when it has no Hebrew label', async () => {
    vi.mocked(draws.listDraws).mockReset();
    vi.mocked(draws.listDraws).mockResolvedValue({
      items: [{ ...draw(4100), status: 'brand_new_status' as DrawSummary['status'] }],
      total: 1,
      page: 1,
      pageSize: DRAWS_PAGE_SIZE,
    });
    renderPage();
    expect(await screen.findByText('brand_new_status')).toBeInTheDocument();
  });
});
