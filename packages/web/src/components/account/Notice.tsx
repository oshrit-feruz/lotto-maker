export function Loading() {
  return <p className="muted">טוען…</p>;
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      {message}{' '}
      {onRetry ? (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          נסו שוב
        </button>
      ) : null}
    </div>
  );
}

/** Shown when the backend endpoint for a section does not exist yet (404). */
export function NotAvailable({ what }: { what: string }) {
  return <div className="alert alert-info">{what} יהיו זמינים בקרוב.</div>;
}
