'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, errorMessage } from './api-client';

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  /** 404 from the backend: the endpoint is not there yet. */
  notAvailable: boolean;
  loading: boolean;
  reload: () => void;
}

/** GET through the proxy, with loading/error state. `path` null skips the call. */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    api
      .get<T>(path)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
        setNotAvailable(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        const missing = err instanceof ApiError && err.status === 404;
        setNotAvailable(missing);
        setError(missing ? null : errorMessage(err));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, notAvailable, loading, reload };
}
