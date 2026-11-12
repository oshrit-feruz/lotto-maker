import type { ReactNode } from 'react';

export function Loading() {
  return <p className="muted">טוען…</p>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'שגיאה לא צפויה';
  return (
    <div className="error" role="alert">
      {msg}{' '}
      {onRetry && (
        <button className="link" onClick={onRetry}>
          נסה שוב
        </button>
      )}
    </div>
  );
}

export function Empty({ children = 'אין נתונים' }: { children?: ReactNode }) {
  return <p className="muted">{children}</p>;
}

export function Badge({
  tone = 'gray',
  children,
}: {
  tone?: 'gray' | 'green' | 'red' | 'amber' | 'blue';
  children: ReactNode;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/** Wraps a query result: loading / error / data. */
export function QueryState<T>({
  q,
  children,
}: {
  q: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  children: (data: T) => ReactNode;
}) {
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} onRetry={() => void q.refetch()} />;
  if (q.data === undefined) return null;
  return <>{children(q.data)}</>;
}
