import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { confirmDraw, editDrawResults, getDraw } from '../api/draws';
import { errorText } from '../api/errors';
import type { DrawDetail, EditResultsBody } from '../api/types';
import ConfirmDrawDialog from '../components/ConfirmDrawDialog';
import { Badge, QueryState } from '../components/ui';
import { isDrawReadOnly, tierId, toBody, toForm, type DrawForm } from '../lib/drawForm';
import { formatDate } from '../lib/format';
import { GAMES, GAME_LABEL, TIER_KEYS } from '../lib/payout';
import { DRAW_STATUS_LABEL, labelOf } from '../lib/labels';

export default function DrawDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['draw', id], queryFn: () => getDraw(id) });
  return (
    <>
      <p>
        <Link to="/draws">← הגרלות</Link>
      </p>
      <QueryState q={q}>{(draw) => <DrawEditor key={draw.id} draw={draw} />}</QueryState>
    </>
  );
}

export function DrawEditor({ draw }: { draw: DrawDetail }) {
  const qc = useQueryClient();
  const readOnly = isDrawReadOnly(draw);
  const [form, setForm] = useState<DrawForm>(() => toForm(draw));
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);

  useEffect(() => {
    setForm(toForm(draw));
    setDirty(false);
  }, [draw]);

  const done = (d: DrawDetail) => {
    qc.setQueryData(['draw', d.id], d);
    void qc.invalidateQueries({ queryKey: ['draws'] });
  };
  const save = useMutation({
    mutationFn: (b: EditResultsBody) => editDrawResults(draw.id, b),
    onSuccess: (d) => {
      setStaleNotice(null);
      done(d);
    },
  });
  const confirm = useMutation({
    // The updatedAt of the draw the admin is looking at: if it changed since, nothing is confirmed.
    mutationFn: (reviewed: DrawDetail) => confirmDraw(reviewed.id, reviewed.updatedAt),
    onSuccess: (d) => {
      setConfirming(false);
      done(d);
    },
    onError: (err) => {
      if (err instanceof ApiError && (err.code === 'RESULTS_CHANGED' || err.code === 'DRAW_NOT_CONFIRMABLE')) {
        // Close the dialog so the admin reviews the reloaded results before confirming again.
        setConfirming(false);
        setStaleNotice(err.message);
        void qc.invalidateQueries({ queryKey: ['draw', draw.id] });
        void qc.invalidateQueries({ queryKey: ['draws'] });
      }
    },
  });
  const inputsDisabled = readOnly || save.isPending;

  const set = (fn: (f: DrawForm) => DrawForm) => {
    setForm(fn);
    setDirty(true);
    setFormError(null);
  };
  const onSave = () => {
    save.reset();
    const body = toBody(form);
    if (typeof body === 'string') return setFormError(body);
    setFormError(null);
    save.mutate(body);
  };

  const numInput = (value: string, onChange: (v: string) => void, label: string) => (
    <input
      key={label}
      aria-label={label}
      value={value}
      disabled={inputsDisabled}
      inputMode="numeric"
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <>
      <h1>
        הגרלה {draw.drawNumber} <Badge>{labelOf(DRAW_STATUS_LABEL, draw.status)}</Badge>{' '}
        {draw.needsAttention && <Badge tone="red">דורש טיפול</Badge>}
      </h1>
      <p className="muted">
        הגרלה: {formatDate(draw.drawAt)} · סגירת מכירות: {formatDate(draw.salesCloseAt)}
        {draw.confirmedAt && <> · אושרה: {formatDate(draw.confirmedAt)}</>}
      </p>
      {draw.attentionReason && (
        <div className="card error" role="alert">
          <strong>דורש טיפול:</strong> {draw.attentionReason}
        </div>
      )}
      {readOnly && (
        <p className="muted">
          {draw.status === 'settled' ? 'ההגרלה סולקה' : 'התוצאות אושרו והסילוק בתהליך'} – המסך במצב קריאה בלבד.
        </p>
      )}
      {!readOnly && draw.status === 'results_confirmed' && (
        <p className="muted">הסילוק נכשל – ניתן לתקן את התוצאות ולשמור, והמערכת תנסה לסלק שוב.</p>
      )}

      <div className="card ltr">
        <h2>תוצאות</h2>
        <div className="nums">
          {form.numbers.map((v, i) =>
            numInput(v, (x) => set((f) => ({ ...f, numbers: f.numbers.map((o, j) => (j === i ? x : o)) })), `מספר ${i + 1}`),
          )}
          <span>+</span>
          {numInput(form.strong, (x) => set((f) => ({ ...f, strong: x })), 'מספר חזק')}
        </div>
        <h3>אקסטרה</h3>
        <div className="nums">
          {form.extraDigits.map((v, i) =>
            numInput(v, (x) => set((f) => ({ ...f, extraDigits: f.extraDigits.map((o, j) => (j === i ? x : o)) })), `ספרת אקסטרה ${i + 1}`),
          )}
        </div>
      </div>

      <div className="prize-grid">
        {GAMES.map((g) => (
          <div className="card" key={g}>
            <h2>{GAME_LABEL[g]}</h2>
            <table>
              <thead>
                <tr>
                  <th>דרגה</th>
                  <th>זוכים</th>
                  <th>פרס (₪)</th>
                </tr>
              </thead>
              <tbody>
                {TIER_KEYS[g].map((t) => {
                  const id = tierId(g, t);
                  const upd = (patch: Partial<DrawForm['tiers'][string]>) =>
                    set((f) => ({ ...f, tiers: { ...f.tiers, [id]: { ...(f.tiers[id] ?? { winners: '', amount: '' }), ...patch } } }));
                  const row = form.tiers[id] ?? { winners: '', amount: '' };
                  return (
                    <tr key={t}>
                      <td className="ltr">{t}</td>
                      <td>{numInput(row.winners, (v) => upd({ winners: v }), `${GAME_LABEL[g]} ${t} זוכים`)}</td>
                      <td>{numInput(row.amount, (v) => upd({ amount: v }), `${GAME_LABEL[g]} ${t} פרס`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {staleNotice && <p className="error" role="alert">{staleNotice}</p>}
      {formError && <p className="error" role="alert">{formError}</p>}
      {save.isError && <p className="error" role="alert">{errorText(save.error)}</p>}

      {!readOnly && (
        <div className="row">
          <button onClick={onSave} disabled={!dirty || save.isPending}>
            {save.isPending ? 'שומר…' : 'שמור שינויים'}
          </button>
          <button
            onClick={() => {
              setStaleNotice(null);
              confirm.reset();
              setConfirming(true);
            }}
            disabled={dirty || save.isPending || draw.status !== 'results_suggested'}>
            אשר תוצאות
          </button>
          {dirty && <span className="muted">יש שינויים שלא נשמרו – שמור לפני האישור.</span>}
          {!dirty && draw.status === 'scheduled' && <span className="muted">אין עדיין תוצאות מוצעות – הזן ושמור.</span>}
        </div>
      )}

      {confirming && (
        <ConfirmDrawDialog
          draw={draw}
          busy={confirm.isPending}
          error={confirm.isError ? errorText(confirm.error) : null}
          onConfirm={() => confirm.mutate(draw)}
          onCancel={() => {
            confirm.reset();
            setConfirming(false);
          }}
        />
      )}
    </>
  );
}
