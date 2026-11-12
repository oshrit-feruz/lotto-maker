import type { ReactNode } from 'react';
import { errorText } from '../api/errors';
import { formatNis } from '../lib/format';

export function Loading() {
  return <p className="muted">טוען…</p>;
}

/** Previous / next controls for a `{ total, page, pageSize }` response. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  disabled?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="row" style={{ marginTop: 12 }}>
      <button className="secondary" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
        הקודם
      </button>
      <span>
        עמוד {page} מתוך {pages}
      </span>
      <button className="secondary" disabled={disabled || page >= pages} onClick={() => onPage(page + 1)}>
        הבא
      </button>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = errorText(error);
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

/** An amount as `₪1,234.00` / `-₪14.50`, isolated LTR so the minus stays in front in RTL text. */
export function Money({ value, className }: { value: number | string | null | undefined; className?: string | undefined }) {
  return (
    <span dir="ltr" className={['money', className].filter(Boolean).join(' ')}>
      {formatNis(value)}
    </span>
  );
}
