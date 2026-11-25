'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/format';
import type { ResultDrawRef } from '@/lib/results';

/**
 * A compact "jump to draw" picker. It is a plain GET form, so it works before hydration (the
 * button submits it); once hydrated, choosing a draw navigates right away and the button goes.
 */
export function DrawPicker({ history, drawNumber }: Readonly<{ history: ResultDrawRef[]; drawNumber: number | null }>) {
  const router = useRouter();
  // Until hydration (or if the bundle never loads) the button submits the form.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (history.length < 2) return null;
  // A draw opened by URL can be older than the history window: list it too, so the picker shows it.
  const outside = drawNumber !== null && !history.some((d) => d.drawNumber === drawNumber);
  return (
    <form action="/results" method="get" className="draw-picker">
      <label htmlFor="draw-picker">מעבר להגרלה</label>
      <select
        id="draw-picker"
        name="draw"
        // Remount on every draw change: prev/next links keep this component mounted, and an
        // uncontrolled select would keep showing the draw it started with.
        key={drawNumber ?? 'latest'}
        defaultValue={drawNumber ?? undefined}
        onChange={(e) => router.push(`/results?draw=${e.target.value}`)}
      >
        {outside ? <option value={drawNumber}>הגרלה {drawNumber}</option> : null}
        {history.map((d) => (
          <option key={d.drawNumber} value={d.drawNumber}>
            הגרלה {d.drawNumber} · {formatDate(d.drawAt)}
          </option>
        ))}
      </select>
      {hydrated ? null : (
        <button className="btn btn-ghost btn-sm" type="submit">
          הצג
        </button>
      )}
    </form>
  );
}
