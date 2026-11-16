import { useQueue } from '../hooks/useQueue.js';
import { useQueueStore } from '../store/queue.store.js';
import { QueueItem } from '../components/QueueItem/QueueItem.js';

export function QueuePage() {
  useQueue();

  const { slots, connectionStatus } = useQueueStore();
  const statusTone = connectionStatus === 'connected' ? 'badge-ok' : connectionStatus === 'reconnecting' ? 'badge-warn' : 'badge-bad';
  const statusLabel = connectionStatus === 'connected' ? 'חי' : connectionStatus === 'reconnecting' ? 'מתחבר...' : 'מנותק';

  return (
    <main className="page">
      <div className="page-head">
        <h1>תור הקלדה</h1>
        <span className={`badge ${statusTone}`} role="status">
          <span className="dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      {slots.length === 0 ? (
        <p className="empty">אין הזמנות בתור כרגע</p>
      ) : (
        <div className="queue">
          {slots.map((slot) => (
            <QueueItem key={slot.id} slot={slot} />
          ))}
        </div>
      )}
    </main>
  );
}
