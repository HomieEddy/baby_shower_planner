// GSM 03.38 (GSM-7) character set. Anything outside it switches an SMS to
// UCS-2 (70 chars per segment instead of 160), so text bound for SMS is folded
// to GSM-7 first.

const GSM7_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENSION = '^{}\\[~]|€';
export const isGsm7 = (text: string): boolean =>
  [...text].every((ch) => GSM7_BASIC.includes(ch) || GSM7_EXTENSION.includes(ch));

// Keep GSM-7 characters as they are. Fold the rest to a plain letter when
// possible (ê -> e, ô -> o, ç -> c, œ -> oe, curly quotes -> straight), else '?'.
const FOLD: Record<string, string> = { 'œ': 'oe', 'Œ': 'OE', '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u00a0': ' ' };
export function foldToGsm(text: string): string {
  return [...text].map((ch) => {
    if (isGsm7(ch)) return ch;
    if (FOLD[ch]) return FOLD[ch];
    const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return isGsm7(base) ? base : '?';
  }).join('');
}
