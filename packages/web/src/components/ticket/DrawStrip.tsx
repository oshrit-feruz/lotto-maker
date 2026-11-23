'use client';

import { formatShekel } from '@/lib/format';
import type { NextDraw } from '@/lib/types';
import { useApi } from '@/lib/use-api';
import { Countdown } from '../Countdown';

/**
 * Jackpot and time left for the next draw, above the ticket form. Loaded in the browser after the
 * form renders, so a slow /draws/next never delays the form; renders nothing until (or unless) it answers.
 */
export function DrawStrip() {
  const { data: draw } = useApi<NextDraw>('draws/next');
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
