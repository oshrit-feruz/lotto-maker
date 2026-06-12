import { useEffect, useRef } from 'react';
import { useQueueStore } from '../store/queue.store.js';
import { fetchQueue } from '../api/client.js';

const POLL_INTERVAL_MS = 5000;
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const SSE_URL = `${API_BASE || '/api'}/operator/queue/stream`;

export function useQueue() {
  const { setSlots, updateSlot, removeSlot, setConnectionStatus } = useQueueStore();
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef(0);

  function startPolling() {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const { slots } = await fetchQueue();
        setSlots(slots);
      } catch {}
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function connectSSE() {
    const token = localStorage.getItem('operator_token');
    if (!token) return;

    const es = new EventSource(`${SSE_URL}?token=${token}`);
    esRef.current = es;
    setConnectionStatus('reconnecting');

    es.onopen = () => {
      setConnectionStatus('connected');
      retryRef.current = 0;
      stopPolling();
    };

    es.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'initial') {
          setSlots(msg.slots as Parameters<typeof setSlots>[0]);
        } else if (msg.type === 'slot_updated') {
          updateSlot(msg.slot.id, msg.slot);
        } else if (msg.type === 'slot_completed' || msg.type === 'slot_scanned') {
          removeSlot(msg.slotId);
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setConnectionStatus('disconnected');
      startPolling();

      // Exponential backoff reconnect
      const delay = Math.min(1000 * 2 ** retryRef.current, 30000);
      retryRef.current += 1;
      setTimeout(() => connectSSE(), delay);
    };
  }

  useEffect(() => {
    connectSSE();
    return () => {
      esRef.current?.close();
      stopPolling();
    };
  }, []);
}
