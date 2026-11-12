import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { confirmDraw, editDrawResults, getDraw } from '../api/draws';
import type { DrawDetail, EditResultsBody } from '../api/types';
import ConfirmDrawDialog from '../components/ConfirmDrawDialog';
import { Badge, QueryState } from '../components/ui';
import { formatDate } from '../lib/format';
import { GAMES, GAME_LABEL, TIER_KEYS } from '../lib/payout';
import { DRAW_STATUS_LABEL } from './DrawsPage';

interface Form {
  numbers: string[];
  strong: string;
  extraDigits: string[];
  tiers: Record<string, { winners: string; amount: string }>;
}

const tierId = (game: string, tier: string) => `${game}:${tier}`;

function toForm(d: DrawDetail): Form {
  const pad = (a: number[], n: number) => Array.from({ length: n }, (_, i) => (a[i] !== undefined ? String(a[i]) : ''));
  const tiers: Form['tiers'] = {};
  for (const g of GAMES) {
    for (const t of TIER_KEYS[g]) {
      const found = d.prizeTiers.find((p) => p.game === g && p.tier === t);
      tiers[tierId(g, t)] = found
        ? { winners: String(found.winnersCount), amount: String(Number(found.prizeAmount)) }
        : { winners: '', amount: '' };
    }
  }
  return { numbers: pad(d.numbers, 6), strong: d.strong === null ? '' : String(d.strong), extraDigits: pad(d.extraDigits, 6), tiers };
}

function toBody(f: Form): EditResultsBody | string {
  const nums = f.numbers.map(Number);
  const extra = f.extraDigits.map(Number);
  if (f.numbers.some((n) => n === '') || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 37))
    return 'המספרים חייבים להיות 1–37';
  if (new Set(nums).size !== nums.length) return 'המספרים חייבים להיות שונים';
  const strong = Number(f.strong);
  if (f.strong === '' || !Number.isInteger(strong) || strong < 1 || strong > 7) return 'המספר החזק חייב להיות 1–7';
  if (f.extraDigits.some((n) => n === '') || extra.some((n) => !Number.isInteger(n) || n < 1 || n > 7))
    return 'ספרות אקסטרה חייבות להיות 1–7';
  const prizeTiers: EditResultsBody['prizeTiers'] = [];
  for (const g of GAMES) {
    for (const t of TIER_KEYS[g]) {
      const row = f.tiers[tierId(g, t)];
      if (!row || row.amount === '') continue; // an empty amount means "not set"
      const winnersCount = Number(row.winners || 0);
      const prizeAmount = Number(row.amount);
      if (!Number.isInteger(winnersCount) || winnersCount < 0 || !Number.isFinite(prizeAmount) || prizeAmount < 0)
        return `ערך לא תקין בטבלת ${GAME_LABEL[g]} (${t})`;
      prizeTiers.push({ game: g, tier: t, winnersCount, prizeAmount });
    }
  }
  if (prizeTiers.length === 0) return 'יש להזין לפחות דרגת פרס אחת';
  return { numbers: nums, strong, extraDigits: extra, prizeTiers };
}

export default function DrawDetailPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['draw', id], queryFn: () => getDraw(id) });
  return (
    <>
      <p>
        <Link to="/draws">← הגרלות</Link>
      </p>
      <QueryState q={q}>{(draw) => <DrawEditor key={draw.id + draw.status} draw={draw} />}</QueryState>
    </>
  );
}

function DrawEditor({ draw }: { draw: DrawDetail }) {
  const qc = useQueryClient();
  const readOnly = draw.status === 'results_confirmed' || draw.status === 'settled';
  const [form, setForm] = useState<Form>(() => toForm(draw));
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setForm(toForm(draw));
    setDirty(false);
  }, [draw]);

  const done = (d: DrawDetail) => {
    qc.setQueryData(['draw', d.id], d);
    void qc.invalidateQueries({ queryKey: ['draws'] });
  };
  const save = useMutation({ mutationFn: (b: EditResultsBody) => editDrawResults(draw.id, b), onSuccess: done });
  const confirm = useMutation({
    mutationFn: () => confirmDraw(draw.id),
    onSuccess: (d) => {
      setConfirming(false);
      done(d);
    },
  });

  const set = (fn: (f: Form) => Form) => {
    setForm(fn);
    setDirty(true);
  };
  const onSave = () => {
    const body = toBody(form);
    if (typeof body === 'string') return setFormError(body);
    setFormError(null);
    save.mutate(body);
  };

  const numInput = (value: string, onChange: (v: string) => void, label: string) => (
    <input aria-label={label} value={value} disabled={readOnly} inputMode="numeric" onChange={(e) => onChange(e.target.value)} />
  );

  return (
    <>
      <h1>
        הגרלה {draw.drawNumber} <Badge>{DRAW_STATUS_LABEL[draw.status]}</Badge>{' '}
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
      {readOnly && <p className="muted">התוצאות אושרו – המסך במצב קריאה בלבד.</p>}

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

      <div className="grid2">
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
                  const row = form.tiers[tierId(g, t)] ?? { winners: '', amount: '' };
                  const upd = (patch: Partial<typeof row>) =>
                    set((f) => ({ ...f, tiers: { ...f.tiers, [tierId(g, t)]: { ...row, ...patch } } }));
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

      {formError && <p className="error" role="alert">{formError}</p>}
      {save.isError && <p className="error" role="alert">{(save.error as Error).message}</p>}

      {!readOnly && (
        <div className="row">
          <button onClick={onSave} disabled={!dirty || save.isPending}>
            {save.isPending ? 'שומר…' : 'שמור שינויים'}
          </button>
          <button onClick={() => setConfirming(true)} disabled={dirty || draw.status !== 'results_suggested'}>
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
          error={confirm.isError ? (confirm.error as Error).message : null}
          onConfirm={() => confirm.mutate()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
