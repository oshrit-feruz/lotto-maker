import type { DrawDetail } from '../api/types';
import { formatNis } from '../lib/format';
import { GAMES, GAME_LABEL, computePayout } from '../lib/payout';
import { ConfirmDialog } from './Dialog';

/** Shows exactly what will be paid when the draw results are confirmed. */
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
  const payout = computePayout(draw.prizeTiers);
  return (
    <ConfirmDialog
      title={`אישור תוצאות הגרלה ${draw.drawNumber}`}
      confirmLabel="אשר ושלם"
      busy={busy ?? false}
      error={error ?? null}
      danger
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p className="ltr">
        {draw.numbers.join(' · ')} + {draw.strong ?? '?'} | {draw.extraDigits.join('')}
      </p>
      <table>
        <thead>
          <tr>
            <th>משחק</th>
            <th>זוכים</th>
            <th>סכום</th>
          </tr>
        </thead>
        <tbody>
          {GAMES.map((g) => {
            const rows = draw.prizeTiers.filter((t) => t.game === g);
            return (
              <tr key={g}>
                <td>{GAME_LABEL[g]}</td>
                <td data-testid={`winners-${g}`}>{rows.reduce((s, t) => s + t.winnersCount, 0)}</td>
                <td data-testid={`total-${g}`}>{formatNis(payout.perGame[g])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        <strong>
          סה״כ לתשלום: <span data-testid="grand-total">{formatNis(payout.total)}</span>
        </strong>{' '}
        ({payout.winners} זוכים)
      </p>
      <p className="muted">לאחר האישור לא ניתן לערוך את התוצאות והזכיות ישולמו מיד.</p>
    </ConfirmDialog>
  );
}
