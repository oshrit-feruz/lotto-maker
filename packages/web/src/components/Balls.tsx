export function Balls({ numbers, strong }: { numbers: number[]; strong?: number[] | number | null }) {
  const strongList = strong === null || strong === undefined ? [] : Array.isArray(strong) ? strong : [strong];
  return (
    <span className="balls" dir="ltr">
      {numbers.map((n) => (
        <span key={`n${n}`} className="ball">
          {n}
        </span>
      ))}
      {strongList.map((s) => (
        <span key={`s${s}`} className="ball ball-strong" title="המספר החזק">
          {s}
        </span>
      ))}
    </span>
  );
}
