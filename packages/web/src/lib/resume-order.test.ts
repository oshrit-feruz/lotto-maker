import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSubmitAfterLogin, loadDraft, markSubmitAfterLogin, saveDraft, takeSubmitAfterLogin } from './draft';
import { resumeAfterLogin, resumeWithTicket } from './resume-order';
import { cryptoRng, initialTicketState, ticketReducer } from './ticket-state';

const filled = () => ticketReducer(initialTicketState(), { type: 'lottomatAll', rng: cryptoRng });

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('resumeAfterLogin', () => {
  it('goes straight to checkout with a complete ticket and a pending submit', () => {
    expect(resumeAfterLogin({ authenticated: true, submitPending: true, draft: filled() })).toBe('/checkout');
  });

  it('stays on the form when not logged in, nothing was submitted, or there is no draft', () => {
    expect(resumeAfterLogin({ authenticated: false, submitPending: true, draft: filled() })).toBeNull();
    expect(resumeAfterLogin({ authenticated: true, submitPending: false, draft: filled() })).toBeNull();
    expect(resumeAfterLogin({ authenticated: true, submitPending: true, draft: null })).toBeNull();
  });

  it('stays on the form when the stored ticket is incomplete or invalid', () => {
    expect(resumeAfterLogin({ authenticated: true, submitPending: true, draft: initialTicketState() })).toBeNull();
    const t = filled();
    const bad = { ...t, tables: [...t.tables, t.tables[0]] }; // odd table count
    expect(resumeAfterLogin({ authenticated: true, submitPending: true, draft: bad })).toBeNull();
    expect(resumeAfterLogin({ authenticated: true, submitPending: true, draft: 'garbage' })).toBeNull();
  });
});

describe('the filled form survives a login (sessionStorage)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: new MemoryStorage() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the ticket and resumes the order once, after login', () => {
    const ticket = filled();
    saveDraft(ticket);
    markSubmitAfterLogin();
    // ...OTP login happens in the dialog, the page may even reload...
    const next = resumeAfterLogin({ authenticated: true, submitPending: takeSubmitAfterLogin(), draft: loadDraft() });
    expect(next).toBe('/checkout');
    expect(loadDraft()).toEqual(ticket);
    // The flag is consumed: a later visit to the form does not jump to checkout again.
    expect(takeSubmitAfterLogin()).toBe(false);
  });

  it('closing the login dialog cancels the pending submit', () => {
    saveDraft(filled());
    markSubmitAfterLogin();
    clearSubmitAfterLogin();
    expect(resumeAfterLogin({ authenticated: true, submitPending: takeSubmitAfterLogin(), draft: loadDraft() })).toBeNull();
  });
});

describe('storage that refuses writes (quota exceeded, disabled)', () => {
  beforeEach(() => {
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    };
    vi.stubGlobal('window', { sessionStorage: refusing });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never throws and reports that nothing was stored', () => {
    expect(saveDraft(filled())).toBe(false);
    expect(markSubmitAfterLogin()).toBe(false);
    expect(() => clearSubmitAfterLogin()).not.toThrow();
    expect(takeSubmitAfterLogin()).toBe(false);
    expect(loadDraft()).toBeNull();
  });

  it('after login the order does not go to checkout when the ticket cannot be stored', () => {
    expect(resumeWithTicket(filled(), true, saveDraft)).toBe('storage-error');
  });
});

describe('storage that works', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: new MemoryStorage() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports a stored draft and marker', () => {
    expect(saveDraft(filled())).toBe(true);
    expect(markSubmitAfterLogin()).toBe(true);
  });
});

describe('resumeWithTicket (right after the in-place login)', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { sessionStorage: new MemoryStorage() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resumes with the submitted in-memory ticket and re-saves it over a stale draft', () => {
    const stale = filled();
    saveDraft(stale);
    const submitted = ticketReducer(filled(), { type: 'setExtra', extra: true });
    expect(resumeWithTicket(submitted, true, saveDraft)).toBe('/checkout');
    expect(loadDraft()).toEqual(submitted);
  });

  it('stays on the form when nothing was submitted or the ticket is incomplete, without saving', () => {
    const save = vi.fn(() => true);
    expect(resumeWithTicket(filled(), false, save)).toBeNull();
    expect(resumeWithTicket(initialTicketState(), true, save)).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  it('reports a storage error instead of navigating when the save fails', () => {
    expect(resumeWithTicket(filled(), true, () => false)).toBe('storage-error');
  });
});
