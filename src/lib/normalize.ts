/** Normalize Persian text for search (ی/ک, diacritics, digits). */
export function normalizeFa(input: string): string {
  return input
    .trim()
    .replace(/\u064A/g, "\u06CC")
    .replace(/\u0649/g, "\u06CC")
    .replace(/\u0643/g, "\u06A9")
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[\u200c\u200f\u200e]/g, " ")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/\s+/g, " ")
    .toLowerCase();
}
