'use client';

import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/format';
import type { ResultDrawRef } from '@/lib/results';

/**
 * A compact "jump to draw" picker. It is a plain GET form, so it works before hydration (the
 * button submits it); once hydrated, choosing a draw navigates right away.
 */
export function DrawPicker({ history, drawNumber }: Readonly<{ history: ResultDrawRef[]; drawNumber: number | null }>) {
  const router = useRouter();
  if (history.length < 2) return null;
  return (
    <form action="/results" method="get" className="draw-picker">
      <label htmlFor="draw-picker">מעבר להגרלה</label>
      <select
        id="draw-picker"
        name="draw"
        defaultValue={drawNumber ?? undefined}
        onChange={(e) => router.push(`/results?draw=${e.target.value}`)}
      >
        {history.map((d) => (
          <option key={d.drawNumber} value={d.drawNumber}>
            הגרלה {d.drawNumber} · {formatDate(d.drawAt)}
          </option>
        ))}
      </select>
      <noscript>
        <button className="btn btn-ghost btn-sm" type="submit">
          הצג
        </button>
      </noscript>
    </form>
  );
}
