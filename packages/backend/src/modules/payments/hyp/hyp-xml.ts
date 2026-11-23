import { xmlEscape } from '../../../lib/http.js';

/**
 * The few XML helpers the Hyp (CreditGuard) "ashrait" protocol needs. Requests are small and
 * flat, and we read a handful of known leaf elements from responses, so no XML library.
 */

export interface XmlFields {
  [name: string]: string | number | undefined | XmlFields;
}

/** Builds child elements in insertion order. `undefined` values are left out; nested objects nest. */
export function xmlElements(fields: XmlFields): string {
  let out = '';
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const inner = typeof value === 'object' ? xmlElements(value) : xmlEscape(String(value));
    out += `<${name}>${inner}</${name}>`;
  }
  return out;
}

/** An `<ashrait><request>` document for one command. */
export function ashraitRequest(command: string, body: XmlFields, language: 'HEB' | 'ENG'): string {
  return (
    '<ashrait><request>' +
    xmlElements({ version: '2000', language, dateTime: '', requestId: '', command }) +
    `<${command}>${xmlElements(body)}</${command}>` +
    '</request></ashrait>'
  );
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXmlText(s: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/.exec(s);
  if (cdata) return cdata[1]!;
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? '';
  });
}

/**
 * Text of the first `<name>` element in `xml` (attributes allowed), entity-decoded and trimmed.
 * `''` for an empty element, `undefined` when there is none.
 */
export function xmlField(xml: string, name: string): string | undefined {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${name}\\s*>)`);
  const m = re.exec(xml);
  if (!m) return undefined;
  return decodeXmlText(m[1] ?? '').trim();
}

/** Raw inner XML of every `<name>` element (for repeated rows). */
export function xmlBlocks(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}\\s*>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]!);
}
