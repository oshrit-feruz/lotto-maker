import type { PriceDisplay } from '@/lib/price';

export function PriceSummary({ price }: { price: PriceDisplay }) {
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
      {price.warning ? <div className="alert alert-warn small">{price.warning}</div> : null}
    </>
  );
}
