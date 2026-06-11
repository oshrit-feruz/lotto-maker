import { useQueue } from '../hooks/useQueue.js';
import { useQueueStore } from '../store/queue.store.js';
import { QueueItem } from '../components/QueueItem/QueueItem.js';

export function QueuePage() {
  useQueue();

  const { slots, connectionStatus } = useQueueStore();
  const statusColor = connectionStatus === 'connected' ? '#057a55' : connectionStatus === 'reconnecting' ? '#d97706' : '#e02424';
  const statusLabel = connectionStatus === 'connected' ? '● חי' : connectionStatus === 'reconnecting' ? '● מתחבר...' : '● מנותק';

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif', direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem' }}>תור הקלדה</h1>
        <span style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
      </div>

      {slots.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#6b7280', marginTop: 60 }}>אין הזמנות בתור כרגע</p>
      ) : (
        slots.map((slot) => <QueueItem key={slot.id} slot={slot} />)
      )}
    </div>
  );
}
