import Link from 'next/link';
import { formatDateTime, formatShekel } from '@/lib/format';
import type { CreateOrderResponse } from '@/lib/types';

export function OrderPlaced({ result }: { result: CreateOrderResponse }) {
  return (
    <div className="card">
      <div className="alert alert-ok" role="status">
        ההזמנה התקבלה! חויבו <span dir="ltr">{formatShekel(result.totalCharged)}</span> מהארנק.
      </div>
      {result.replayed ? (
        <p className="small muted">ההזמנה הזו כבר נקלטה בניסיון קודם, ולכן לא חויבתם פעם נוספת.</p>
      ) : null}
      <ul>
        {result.orders.map((o) => (
          <li key={o.orderId}>
            הגרלה {o.drawNumber}: {formatDateTime(o.drawAt)}
          </li>
        ))}
      </ul>
      <p className="muted small">
        השליח יגיש את הטופס בנקודת מכירה מורשית. צילום הטופס יופיע באזור האישי אחרי ההגשה.
      </p>
      <div className="row">
        <Link className="btn" href="/account/orders">
          להזמנות שלי
        </Link>
        <Link className="btn btn-ghost" href="/ticket">
          טופס נוסף
        </Link>
      </div>
    </div>
  );
}
