import { TIMEZONE } from '@lotto-maker/shared';

export const NOT_TAX_INVOICE_NOTICE =
  'מסמך זה אינו חשבונית מס. הוא ישמש כחשבונית מס רק לאחר אישור פורמט המסמך על ידי רואה חשבון.';

export interface ReceiptView {
  number: string;
  kind: 'receipt' | 'credit';
  orderId: string;
  customerName: string | null;
  idLast4: string | null;
  feeAmount: { toString(): string };
  vatRate: { toString(): string };
  vatAmount: { toString(): string };
  netAmount: { toString(): string };
  issuedAt: Date;
}

export interface BusinessDetails {
  name: string;
  id: string;
  address: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const money = (v: { toString(): string }) => `₪${Number(v.toString()).toFixed(2)}`;

/** A simple Hebrew, right-to-left receipt page. Every dynamic value is HTML-escaped. */
export function renderReceiptHtml(
  receipt: ReceiptView,
  business: BusinessDetails,
  originalNumber: string | null,
): string {
  const e = escapeHtml;
  const isCredit = receipt.kind === 'credit';
  const title = isCredit ? 'קבלת זיכוי על דמי שירות' : 'קבלה על דמי שירות';
  const date = receipt.issuedAt.toLocaleDateString('he-IL', { timeZone: TIMEZONE });
  const vatPercent = `${(Number(receipt.vatRate.toString()) * 100).toFixed(0)}%`;

  const row = (label: string, value: string) =>
    `<tr><th style="text-align:right;padding:6px 0;font-weight:normal;color:#6b7280">${e(label)}</th>` +
    `<td style="text-align:left;padding:6px 0" dir="ltr">${e(value)}</td></tr>`;

  const businessLines = [
    business.name && `<div><strong>${e(business.name)}</strong></div>`,
    business.id && `<div>ח.פ./ע.מ.: ${e(business.id)}</div>`,
    business.address && `<div>${e(business.address)}</div>`,
  ]
    .filter(Boolean)
    .join('');

  return (
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)} ${e(receipt.number)}</title></head>` +
    `<body style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#111827">` +
    `<div style="border:2px solid #b91c1c;color:#b91c1c;padding:10px 12px;border-radius:6px;font-weight:bold;margin-bottom:20px">${e(NOT_TAX_INVOICE_NOTICE)}</div>` +
    `<div style="margin-bottom:16px">${businessLines}</div>` +
    `<h1 style="font-size:22px;margin:0 0 4px">${e(title)}</h1>` +
    `<div style="color:#6b7280;margin-bottom:16px">מספר ${e(receipt.number)} · ${e(date)}</div>` +
    `<table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb">` +
    (receipt.customerName ? row('שם הלקוח', receipt.customerName) : '') +
    (receipt.idLast4 ? row('ת.ז. (4 ספרות אחרונות)', `****${receipt.idLast4}`) : '') +
    row('מספר הזמנה', receipt.orderId) +
    (isCredit && originalNumber ? row('מתייחס לקבלה מספר', originalNumber) : '') +
    row(isCredit ? 'דמי שירות שזוכו (כולל מע״מ)' : 'דמי שירות (כולל מע״מ)', money(receipt.feeAmount)) +
    row('סכום ללא מע״מ', money(receipt.netAmount)) +
    row(`מע״מ (${vatPercent})`, money(receipt.vatAmount)) +
    `</table>` +
    `<p style="color:#6b7280;font-size:13px">הקבלה מתייחסת לדמי השירות בלבד. מחיר הכרטיס מוחזק עבור הלקוח ואינו הכנסת העסק.</p>` +
    `</body></html>`
  );
}
