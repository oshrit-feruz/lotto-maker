import type { CSSProperties } from 'react';

export function Balls({ numbers, strong }: { numbers: number[]; strong?: number[] | number | null }) {
  const strongList = strong === null || strong === undefined ? [] : Array.isArray(strong) ? strong : [strong];
  return (
    <span className="balls" dir="ltr">
      {numbers.map((n, i) => (
        <span key={`n${n}`} className="ball" style={{ '--i': i } as CSSProperties}>
          {n}
        </span>
      ))}
      {strongList.map((s, i) => (
        <span
          key={`s${s}`}
          className="ball ball-strong"
          title="המספר החזק"
          style={{ '--i': numbers.length + i } as CSSProperties}
        >
          {s}
        </span>
      ))}
    </span>
  );
}
