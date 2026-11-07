// GSM 03.38 (GSM-7) character set. Anything outside it switches an SMS to
// UCS-2 (70 chars per segment instead of 160), so text bound for SMS is folded
// to GSM-7 first.

const GSM7_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENSION = '^{}\\[~]|€';
export const isGsm7 = (text: string): boolean =>
  [...text].every((ch) => GSM7_BASIC.includes(ch) || GSM7_EXTENSION.includes(ch));

// Keep GSM-7 characters as they are. Fold the rest to a plain letter when
// possible (ê -> e, ô -> o, ç -> c, œ -> oe, curly quotes -> straight) and drop
// what has no GSM-7 form (emoji, symbols), tidying the spaces left behind.
const FOLD: Record<string, string> = { 'œ': 'oe', 'Œ': 'OE', '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u00a0': ' ', '\u2026': '...', '\u2013': '-', '\u2014': '-' };
export function foldToGsm(text: string): string {
  const folded = [...text].map((ch) => {
    if (isGsm7(ch)) return ch;
    if (FOLD[ch]) return FOLD[ch];
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return isGsm7(base) ? base : '';
  }).join('');
  return folded.split('\n').map((line) => line.replace(/ {2,}/g, ' ').trim()).join('\n');
}

// One standalone GSM-7 SMS holds 160 characters. Extension characters
// (€ [ ] { } ~ ^ \ |) take two of them.
export const SMS_PART_LIMIT = 160;
const charWeight = (ch: string) => (GSM7_EXTENSION.includes(ch) ? 2 : 1);
export const gsmLength = (text: string): number => [...text].reduce((n, ch) => n + charWeight(ch), 0);

// Split GSM-7 text into standalone SMS of at most `limit` characters, breaking
// at a line break or space so words and links stay whole. A single word longer
// than the limit (a very long link) is cut hard.
export function splitSms(text: string, limit = SMS_PART_LIMIT): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (gsmLength(rest) > limit) {
    let cut = 0;
    let len = 0;
    for (const ch of rest) {
      if (len + charWeight(ch) > limit) break;
      len += charWeight(ch);
      cut += ch.length;
    }
    // Break at a line break near the end of the text (keeps lines whole without
    // wasting much room), else at the last space, else hard at the limit. The
    // character right after the window counts too, since a break there ends
    // the part exactly at the limit.
    const window = rest.slice(0, cut + 1);
    const lineBreak = window.lastIndexOf('\n');
    const space = window.lastIndexOf(' ');
    const end = lineBreak >= limit * 0.8 ? lineBreak : space >= limit / 2 ? space : cut;
    parts.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}
