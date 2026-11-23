import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSubmitAfterLogin, loadDraft, markSubmitAfterLogin, saveDraft, takeSubmitAfterLogin } from './draft';
import { resumeAfterLogin } from './resume-order';
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
