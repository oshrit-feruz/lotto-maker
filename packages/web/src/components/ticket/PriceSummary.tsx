import type { PriceDisplay } from '@/lib/price';

/** `hideWarning`: the caller shows `price.warning` itself (the sticky bar keeps it outside the collapsed details). */
export function PriceSummary({ price, hideWarning = false }: { price: PriceDisplay; hideWarning?: boolean }) {
  return (
    <>
      <ul className="price-lines">
        {price.lines.map((l) => (
          <li key={l.label}>
            <span>{l.label}</span>
            <span dir="ltr">{l.value}</span>
          </li>
        ))}
      </ul>
      {price.warning && !hideWarning ? <div className="alert alert-warn small">{price.warning}</div> : null}
    </>
  );
}
