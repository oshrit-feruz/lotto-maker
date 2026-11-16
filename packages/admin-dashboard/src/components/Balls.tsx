/** A draw's numbers as lottery balls (same object as the website's `Balls`): sun balls, then the strong number in plum. */
export function Balls({ numbers, strong }: Readonly<{ numbers: number[]; strong?: number | null }>) {
  const strongPart = strong != null ? `, חזק ${strong}` : '';
  const label = `${numbers.join(', ')}${strongPart}`;
  return (
    <span className="balls" dir="ltr" role="img" aria-label={label}>
      {numbers.map((n, i) => (
        <span key={`${i}-${n}`} className="ball" aria-hidden="true">
          {n}
        </span>
      ))}
      {strong != null && (
        <span className="ball ball-strong" title="המספר החזק" aria-hidden="true">
          {strong}
        </span>
      )}
    </span>
  );
}

/** Extra digits as one LTR string, as on the website's results page. */
export function ExtraDigits({ digits }: Readonly<{ digits: number[] }>) {
  if (digits.length === 0) return null;
  return (
    <span className="extra-digits">
      ספרות אקסטרה: <strong dir="ltr">{digits.join(' ')}</strong>
    </span>
  );
}
