'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api-client';

/**
 * The ticket scan, from a short-lived signed URL (GET /orders/:id/scan). The
 * lower part, where the barcode is, stays blurred with CSS: the full ticket
 * is only needed when collecting a big prize, which we do for the customer.
 */
export function BlurredScan({ orderId }: { orderId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<{ url: string; expiresIn: number }>(`orders/${encodeURIComponent(orderId)}/scan`)
      .then((r) => alive && setUrl(r.url))
      .catch((err: unknown) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (error) return <div className="alert alert-error small">לא ניתן לטעון את צילום הטופס. {error}</div>;
  if (!url) return <p className="muted small">טוען צילום…</p>;
  return (
    <div className="scan-wrap" onContextMenu={(e) => e.preventDefault()}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL from private storage, not optimisable */}
      <img src={url} alt="צילום הטופס שהוגש" referrerPolicy="no-referrer" draggable={false} />
      <div className="scan-blur" aria-hidden="true">
        הברקוד מוסתר לשמירה על הטופס
      </div>
    </div>
  );
}
