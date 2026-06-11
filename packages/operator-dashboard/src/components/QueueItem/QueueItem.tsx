import { useState } from 'react';
import { CountdownTimer } from '../CountdownTimer/CountdownTimer.js';
import { ScanUpload } from '../ScanUpload/ScanUpload.js';
import { startSlot, doneSlot } from '../../api/client.js';
import { useQueueStore } from '../../store/queue.store.js';
import type { QueueSlotWithOrder } from '../../api/client.js';
import { GAME_DISPLAY_NAMES } from '@lotto-maker/shared';

interface Props {
  slot: QueueSlotWithOrder;
}

export function QueueItem({ slot }: Props) {
  const { updateSlot } = useQueueStore();
  const [showScan, setShowScan] = useState(false);
  const [loading, setLoading] = useState(false);

  const gameName = GAME_DISPLAY_NAMES[slot.order.gameType as keyof typeof GAME_DISPLAY_NAMES] ?? slot.order.gameType;
  const numbersDisplay = slot.order.numbers.join(', ');
  const strongDisplay = slot.order.strongNumber ? ` | חזק: ${slot.order.strongNumber}` : '';

  async function handleStart() {
    setLoading(true);
    try {
      const updated = await startSlot(slot.id);
      updateSlot(slot.id, updated);
    } finally {
      setLoading(false);
    }
  }

  async function handleDone() {
    setLoading(true);
    try {
      await doneSlot(slot.id);
      updateSlot(slot.id, { status: 'done' });
    } finally {
      setLoading(false);
    }
  }

  const borderColor = slot.status === 'in_progress' ? '#1a56db' : '#e5e7eb';

  return (
    <div style={{ border: `2px solid ${borderColor}`, borderRadius: 8, padding: 16, marginBottom: 12, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '1.3rem', fontWeight: 700 }}>{gameName}</span>
        <CountdownTimer deadline={slot.deadline} />
      </div>

      <div style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: 2, marginBottom: 8, direction: 'ltr' }}>
        {numbersDisplay}{strongDisplay}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {slot.status === 'waiting' && (
          <button onClick={handleStart} disabled={loading} style={btnStyle('#1a56db')}>
            התחלתי להקליד
          </button>
        )}
        {slot.status === 'in_progress' && (
          <>
            <button onClick={handleDone} disabled={loading} style={btnStyle('#057a55')}>
              סיימתי
            </button>
            <button onClick={() => setShowScan(true)} style={btnStyle('#6b7280')}>
              סרוק טופס
            </button>
          </>
        )}
      </div>

      {showScan && (
        <ScanUpload
          slotId={slot.id}
          onClose={() => setShowScan(false)}
          onSuccess={(url) => {
            updateSlot(slot.id, { status: 'done' });
            setShowScan(false);
          }}
        />
      )}
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 20px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: 600,
  };
}
