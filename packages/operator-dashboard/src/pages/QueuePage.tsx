import { useQueue } from '../hooks/useQueue.js';
import { useQueueStore, type ConnectionStatus } from '../store/queue.store.js';
import { QueueItem } from '../components/QueueItem/QueueItem.js';

const CONNECTION_BADGE: Record<ConnectionStatus, { tone: string; label: string }> = {
  connected: { tone: 'badge-ok', label: 'חי' },
  reconnecting: { tone: 'badge-warn', label: 'מתחבר...' },
  disconnected: { tone: 'badge-bad', label: 'מנותק' },
};

export function QueuePage() {
  useQueue();

  const { slots, connectionStatus } = useQueueStore();
  const { tone: statusTone, label: statusLabel } = CONNECTION_BADGE[connectionStatus];

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
