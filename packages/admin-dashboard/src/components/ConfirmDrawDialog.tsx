import type { DrawDetail } from '../api/types';
import { formatCount, formatNis } from '../lib/format';
import { GAMES, GAME_LABEL, computePayout } from '../lib/payout';
import { ConfirmDialog } from './Dialog';

export const ESTIMATE_NOTE = 'הערכה לפי טבלת הזכיות הארצית — הסכום בפועל נקבע לפי הטפסים של הלקוחות';

/**
 * Confirms a draw's results. The totals shown are an estimate from the national prize table
 * (its winners counts are national, not this system's customers); settlement computes the real
 * payouts from customers' tickets after confirmation.
 */
export default function ConfirmDrawDialog({
  draw,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  draw: Pick<DrawDetail, 'drawNumber' | 'numbers' | 'strong' | 'extraDigits' | 'prizeTiers'>;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const estimate = computePayout(draw.prizeTiers);
  return (
    <ConfirmDialog
      title={`אישור תוצאות הגרלה ${draw.drawNumber}`}
      confirmLabel="אשר תוצאות"
      busy={busy ?? false}
      error={error ?? null}
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p className="ltr">
        {draw.numbers.join(' · ')} + {draw.strong ?? '?'} | {draw.extraDigits.join('')}
      </p>
      <p className="muted">{ESTIMATE_NOTE}</p>
      <table>
        <thead>
          <tr>
            <th>משחק</th>
            <th>זוכים (ארצי)</th>
            <th>סכום משוער</th>
          </tr>
        </thead>
        <tbody>
          {GAMES.map((g) => {
            const rows = draw.prizeTiers.filter((t) => t.game === g);
            return (
              <tr key={g}>
                <td>{GAME_LABEL[g]}</td>
                <td data-testid={`winners-${g}`}>{formatCount(rows.reduce((s, t) => s + t.winnersCount, 0))}</td>
                <td data-testid={`total-${g}`}>{formatNis(estimate.perGame[g])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <dl className="kv">
        <dt>
          <strong>סה״כ משוער לפי טבלת הזכיות</strong>
        </dt>
        <dd>
          <strong>
            <span data-testid="grand-total" dir="ltr" className="money">
              {formatNis(estimate.total)}
            </span>
          </strong>
        </dd>
        <dt>זוכים ארצית</dt>
        <dd data-testid="grand-winners">{formatCount(estimate.winners)}</dd>
      </dl>
      <p className="muted">
        האישור מתחיל את סילוק הזכיות לפי הטפסים של הלקוחות. בסיום ההגרלה תופיע בסטטוס „שולמה”, או תסומן „דורש טיפול”
        אם הסילוק נכשל. לאחר האישור לא ניתן לערוך את התוצאות, אלא אם ההגרלה מסומנת „דורש טיפול”.
      </p>
    </ConfirmDialog>
  );
}
