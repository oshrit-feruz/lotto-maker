'use client';

import { useEffect, useState } from 'react';

const UNITS = [
  { label: 'ימים', ms: 86_400_000 },
  { label: 'שעות', ms: 3_600_000 },
  { label: 'דקות', ms: 60_000 },
  { label: 'שניות', ms: 1_000 },
] as const;

function split(remaining: number): number[] {
  let rest = Math.max(0, remaining);
  return UNITS.map((u) => {
    const v = Math.floor(rest / u.ms);
    rest -= v * u.ms;
    return v;
  });
}

/**
 * Time left until `until`. The clock only starts after mount (the server and
 * the browser would disagree on "now"), so the first paint shows dashes.
 * Purely visual: the exact cutoff is printed next to it as text.
 */
export function Countdown({ until }: { until: string }) {
  const target = new Date(until).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (Number.isNaN(target)) return null;
  if (now !== null && target - now <= 0) {
    return <p className="countdown-closed">ההזמנות להגרלה זו נסגרו.</p>;
  }

  const parts = now === null ? null : split(target - now);
  return (
    <dl className="countdown" role="timer" aria-live="off" dir="rtl">
      {UNITS.map((u, i) => (
        <div key={u.label}>
          <dt>{u.label}</dt>
          <dd>{parts ? String(parts[i]).padStart(2, '0') : '--'}</dd>
        </div>
      ))}
    </dl>
  );
}
