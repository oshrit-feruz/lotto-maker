import type { CSSProperties } from 'react';

export function Balls({ numbers, strong }: Readonly<{ numbers: number[]; strong?: number[] | number | null }>) {
  let strongList: number[] = [];
  if (Array.isArray(strong)) strongList = strong;
  else if (strong !== null && strong !== undefined) strongList = [strong];
  return (
    // One line always: the balls shrink to fit a narrow row (see .balls in globals.css).
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
