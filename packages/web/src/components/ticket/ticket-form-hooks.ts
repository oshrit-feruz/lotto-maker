'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useRef, useState, type Dispatch } from 'react';
import { ApiError, api, auth, errorMessage } from '@/lib/api-client';
import { clearSubmitAfterLogin, loadDraft, markSubmitAfterLogin, saveDraft, takeSubmitAfterLogin } from '@/lib/draft';
import { DRAFT_STORAGE_ERROR, resumeAfterLogin, resumeWithTicket } from '@/lib/resume-order';
import { initialTicketState, ticketReducer, type TicketAction, type TicketState } from '@/lib/ticket-state';
import type { CalculateResponse, DuplicateResponse } from '@/lib/types';

type Router = ReturnType<typeof useRouter>;

/** The ticket, restored from the stored draft (back from checkout, a reload, or a login) and saved on every change. */
export function useDraftTicket(): [TicketState, Dispatch<TicketAction>] {
  const [state, dispatch] = useReducer(ticketReducer, undefined, initialTicketState);
  // The stored draft is read once per mount (a ref survives Strict Mode's effect re-run), and
  // nothing is autosaved until it has been applied, so the empty initial state never overwrites it.
  const restoreRead = useRef(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (restoreRead.current) return;
    restoreRead.current = true;
    const draft = loadDraft();
    if (draft) dispatch({ type: 'load', state: draft as never });
    setRestored(true);
  }, []);

  // Every change is kept for this tab, so a login or a reload never loses the filled ticket.
  useEffect(() => {
    if (restored) saveDraft(state);
  }, [state, restored]);

  return [state, dispatch];
}

/**
 * null until /api/auth/session answers. Logged out, the form works the same and is priced from
 * the public price list. Logged in, an order submitted before a login (or a reload during it) resumes.
 */
export function useSession(router: Router) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    auth
      .session()
      .then(({ authenticated: loggedIn }) => {
        if (!alive) return;
        setAuthenticated(loggedIn);
        if (!loggedIn) return;
        const next = resumeAfterLogin({ authenticated: true, submitPending: takeSubmitAfterLogin(), draft: loadDraft() });
        if (next) router.push(next);
      })
      .catch(() => alive && setAuthenticated(false));
    return () => {
      alive = false;
    };
  }, [router]);

  return [authenticated, setAuthenticated] as const;
}

export interface LivePrice {
  calc: CalculateResponse | null;
  dup: DuplicateResponse | null;
  priceError: string | null;
  loadingPrice: boolean;
}

function priceErrorText(err: unknown): string {
  return err instanceof ApiError && err.status === 401 ? 'יש להתחבר מחדש כדי לראות מחיר.' : errorMessage(err);
}

/** Backend price and duplicate warning for `requestKey` (a JSON ticket body), debounced; stale answers are dropped. */
export function useLivePrice(requestKey: string | null): LivePrice {
  const [calc, setCalc] = useState<CalculateResponse | null>(null);
  const [dup, setDup] = useState<DuplicateResponse | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const mySeq = ++seq.current;
    if (!requestKey) {
      setCalc(null);
      setDup(null);
      setPriceError(null);
      setLoadingPrice(false);
      return;
    }
    setLoadingPrice(true);
    const timer = setTimeout(async () => {
      const body = JSON.parse(requestKey) as unknown;
      const [c, d] = await Promise.allSettled([
        api.post<CalculateResponse>('tickets/calculate', body),
        api.post<DuplicateResponse>('tickets/check-duplicate', body),
      ]);
      if (mySeq !== seq.current) return;
      setLoadingPrice(false);
      setCalc(c.status === 'fulfilled' ? c.value : null);
      setPriceError(c.status === 'fulfilled' ? null : priceErrorText(c.reason));
      setDup(d.status === 'fulfilled' ? d.value : null);
    }, 350);
    return () => clearTimeout(timer);
  }, [requestKey]);

  return { calc, dup, priceError, loadingPrice };
}

export type RollTarget = number | 'all';

/** Visual only: which table(s) the Lottomat just filled, so the balls drop in. */
export function useRolling() {
  const [rolling, setRolling] = useState<{ target: RollTarget; n: number } | null>(null);
  const rollSeq = useRef(0);

  useEffect(() => {
    if (!rolling) return;
    const timer = setTimeout(() => setRolling(null), 1100);
    return () => clearTimeout(timer);
  }, [rolling]);

  function roll(target: RollTarget) {
    rollSeq.current += 1;
    setRolling({ target, n: rollSeq.current });
  }

  return { rolling, roll };
}

interface CheckoutGateInput {
  router: Router;
  state: TicketState;
  canContinue: boolean;
  loggedIn: boolean;
  setAuthenticated: (v: boolean) => void;
}

/**
 * "Continue to payment": straight to /checkout when logged in, otherwise the login dialog in place
 * and then on to /checkout. /checkout reads the ticket from sessionStorage, so if the browser
 * refuses to store it (private mode, blocked storage, quota) we stay on the form and say so.
 */
export function useCheckoutGate({ router, state, canContinue, loggedIn, setAuthenticated }: CheckoutGateInput) {
  const [loginOpen, setLoginOpen] = useState(false);
  // In-memory copy of the "pay after login" intent, for when sessionStorage refuses the write.
  const submitRequested = useRef(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  function goToCheckout() {
    if (!canContinue) return;
    if (!saveDraft(state)) {
      setStorageError(DRAFT_STORAGE_ERROR);
      return;
    }
    setStorageError(null);
    if (loggedIn) {
      router.push('/checkout');
      return;
    }
    submitRequested.current = true;
    markSubmitAfterLogin();
    setLoginOpen(true);
  }

  function onLoggedIn() {
    setAuthenticated(true);
    const pending = takeSubmitAfterLogin() || submitRequested.current;
    submitRequested.current = false;
    // The ticket just submitted is in memory; the stored draft is only for the reload path (see useSession).
    const next = resumeWithTicket(state, pending, saveDraft);
    if (next === '/checkout') {
      router.push(next);
      return;
    }
    if (next === 'storage-error') setStorageError(DRAFT_STORAGE_ERROR);
    setLoginOpen(false);
  }

  function closeLogin() {
    submitRequested.current = false;
    clearSubmitAfterLogin();
    setLoginOpen(false);
  }

  return { loginOpen, storageError, goToCheckout, onLoggedIn, closeLogin };
}
