import { useState } from 'react';
import { CountdownTimer } from '../CountdownTimer/CountdownTimer.js';
import { ScanUpload } from '../ScanUpload/ScanUpload.js';
import { startSlot, doneSlot } from '../../api/client.js';
import { useQueueStore } from '../../store/queue.store.js';
import type { QueueSlotWithOrder } from '../../api/client.js';
import { SLOT_STATUS_LABEL, numberedTables, slotTitle, systematicLabel } from '../../lib/display.js';

interface Props {
  slot: QueueSlotWithOrder;
}

const STATUS_TONE: Record<string, string> = { in_progress: 'badge-plum', done: 'badge-ok' };

export function QueueItem({ slot }: Readonly<Props>) {
  const { updateSlot, removeSlot } = useQueueStore();
  const [showScan, setShowScan] = useState(false);
  const [loading, setLoading] = useState(false);

  const systematic = systematicLabel(slot.order.systematicType);

  function handleStart() {
    setLoading(true);
    startSlot(slot.id)
      .then((updated) => updateSlot(slot.id, updated))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  function handleDone() {
    setLoading(true);
    doneSlot(slot.id)
      .then(() => updateSlot(slot.id, { status: 'done' }))
      .catch(console.error)
      .finally(() => setLoading(false));
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
        {numberedTables(slot.order.tables).map((t) => (
          <li key={t.key} aria-label={t.label}>
            <span className="table-no" aria-hidden="true">
              {t.no}
            </span>
            <span className="balls" dir="ltr" aria-hidden="true">
              {t.numbers.map((n) => (
                <span key={`n${n}`} className="ball">
                  {n}
                </span>
              ))}
              {t.strongNumbers.map((s) => (
                <span key={`s${s}`} className="ball ball-strong" title="המספר החזק">
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
            <button type="button" onClick={handleStart} disabled={loading} className="btn">
              התחלתי להקליד
            </button>
          )}
          {slot.status === 'in_progress' && (
            <button type="button" onClick={handleDone} disabled={loading} className="btn btn-accent">
              סיימתי
            </button>
          )}
          {/* The scan can only be attached once the form has been keyed */}
          {slot.status === 'done' && (
            <button type="button" onClick={() => setShowScan(true)} className="btn">
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
