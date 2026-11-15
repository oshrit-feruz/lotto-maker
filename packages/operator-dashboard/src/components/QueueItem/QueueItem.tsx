import { useState } from 'react';
import { CountdownTimer } from '../CountdownTimer/CountdownTimer.js';
import { ScanUpload } from '../ScanUpload/ScanUpload.js';
import { startSlot, doneSlot } from '../../api/client.js';
import { useQueueStore } from '../../store/queue.store.js';
import type { QueueSlotWithOrder } from '../../api/client.js';
import { SLOT_STATUS_LABEL, slotTitle, systematicLabel } from '../../lib/display.js';

interface Props {
  slot: QueueSlotWithOrder;
}

const STATUS_TONE: Record<string, string> = { in_progress: 'badge-plum', done: 'badge-ok' };

export function QueueItem({ slot }: Props) {
  const { updateSlot, removeSlot } = useQueueStore();
  const [showScan, setShowScan] = useState(false);
  const [loading, setLoading] = useState(false);

  const systematic = systematicLabel(slot.order.systematicType);

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

  return (
    <article className="stub" data-status={slot.status}>
      <div className="stub-head">
        <div className="stub-title">
          <h2>{slotTitle(slot.order)}</h2>
          {slot.order.drawNumber ? <span className="chip">הגרלה {slot.order.drawNumber}</span> : null}
          {systematic ? <span className="chip">{systematic}</span> : null}
          <span className={`badge ${STATUS_TONE[slot.status] ?? ''}`}>{SLOT_STATUS_LABEL[slot.status] ?? slot.status}</span>
        </div>
        <CountdownTimer deadline={slot.deadline} />
      </div>

      <div className="perf" aria-hidden="true" />

      <ol className="tables">
        {slot.order.tables.map((t, i) => (
          <li key={i} aria-label={`טבלה ${i + 1}: ${t.numbers.join(', ')}${t.strongNumbers.length ? ` | חזק: ${t.strongNumbers.join(', ')}` : ''}`}>
            <span className="table-no" aria-hidden="true">
              {i + 1}
            </span>
            <span className="balls" dir="ltr" aria-hidden="true">
              {t.numbers.map((n, j) => (
                <span key={`n${j}`} className="ball">
                  {n}
                </span>
              ))}
              {t.strongNumbers.map((s, j) => (
                <span key={`s${j}`} className="ball ball-strong" title="המספר החזק">
                  {s}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>

      <div className="stub-foot">
        {slot.order.idLast4 && (
          <div className="id-last4">
            ת.ז. (4 ספרות אחרונות): <strong className="ltr">{slot.order.idLast4}</strong>
          </div>
        )}

        <div className="actions">
          {slot.status === 'waiting' && (
            <button onClick={handleStart} disabled={loading} className="btn">
              התחלתי להקליד
            </button>
          )}
          {slot.status === 'in_progress' && (
            <button onClick={handleDone} disabled={loading} className="btn btn-accent">
              סיימתי
            </button>
          )}
          {/* The scan can only be attached once the form has been keyed */}
          {slot.status === 'done' && (
            <button onClick={() => setShowScan(true)} className="btn">
              סרוק טופס
            </button>
          )}
        </div>
      </div>

      {showScan && (
        <ScanUpload
          slotId={slot.id}
          extra={slot.order.extra}
          onClose={() => setShowScan(false)}
          onSuccess={() => {
            setShowScan(false);
            removeSlot(slot.id);
          }}
        />
      )}
    </article>
  );
}
