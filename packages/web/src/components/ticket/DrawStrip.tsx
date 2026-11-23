import { formatShekel } from '@/lib/format';
import type { NextDraw } from '@/lib/types';
import { Countdown } from '../Countdown';

/** Jackpot and time left for the next draw, above the ticket form. Renders nothing when no draw is open. */
export function DrawStrip({ draw }: Readonly<{ draw: NextDraw | null }>) {
  if (!draw) return null;
  return (
    <section className="draw-strip" aria-label="ההגרלה הבאה">
      <div>
        <div className="small">הגרלה {draw.drawNumber}</div>
        {draw.firstPrize ? (
          <strong className="draw-strip-prize" dir="ltr">
            {formatShekel(draw.firstPrize).replace(/\.00$/, '')}
          </strong>
        ) : null}
      </div>
      <div>
        <div className="small">ההזמנות נסגרות בעוד</div>
        <Countdown until={draw.visibleCutoff || draw.hardCutoff} className="countdown-inline" />
      </div>
    </section>
  );
}
