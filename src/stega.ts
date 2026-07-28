/**
 * Invisible field markers for the on-page visual editor (the "stega" pattern,
 * as used by Sanity and Vercel visual editing).
 *
 * In Draft Mode the server appends a zero-width marker to each editable text
 * value; the edit overlay decodes markers from DOM text nodes to map what the
 * client clicked back to its field. This is what makes click-the-text editing
 * possible without annotating every component with data attributes.
 *
 * Markers NEVER appear in published HTML — they are only added while Draft Mode
 * is enabled, which is an admin-only state.
 *
 * Encoding: U+2060 (word joiner) sentinel + 10 bits of field index as U+200C
 * (0) / U+200D (1) + U+2060 sentinel. All zero-width — invisible, copy-safe,
 * and appended at the END of the value so line wrapping and
 * `whitespace-pre-line` rendering are unaffected.
 *
 * Dependency-free on purpose: shared by server (encode) and client (decode).
 */

// Explicit escapes — never write these as literal characters. They are
// invisible, and an editor or formatter could silently corrupt them.
const SENTINEL = "⁠";
const ZERO = "‌";
const ONE = "‍";
const BITS = 10; // up to 1024 marker indexes per page

/**
 * Fields of the shared "site" pseudo-page (phone, hours, footer) render on
 * every page alongside that page's own fields. Their marker indexes are offset
 * so both sets coexist in one page's marker space: a real page may declare up
 * to 512 fields; site-wide fields occupy 512+.
 */
export const SITE_INDEX_OFFSET = 512;

export const MARKER_PATTERN = new RegExp(
  `${SENTINEL}[${ZERO}${ONE}]{${BITS}}${SENTINEL}`,
  "g",
);

/** Append an invisible marker carrying `index` to a value. */
export function encodeMarker(value: string, index: number): string {
  if (index < 0 || index >= 1 << BITS) return value;
  let bits = "";
  for (let b = BITS - 1; b >= 0; b--) {
    bits += (index >> b) & 1 ? ONE : ZERO;
  }
  return `${value}${SENTINEL}${bits}${SENTINEL}`;
}

/** Decode the first marker found in a string; null if none. */
export function decodeMarker(text: string): number | null {
  MARKER_PATTERN.lastIndex = 0;
  const m = MARKER_PATTERN.exec(text);
  if (!m) return null;
  const bits = m[0].slice(1, -1);
  let index = 0;
  for (const ch of bits) {
    index = (index << 1) | (ch === ONE ? 1 : 0);
  }
  return index;
}

/**
 * Remove marker sequences from a value. Precise — it matches the exact marker
 * shape, so legitimate zero-width joiners (emoji sequences, for instance)
 * survive untouched.
 *
 * Every write path calls this. A marker must never reach the database, or it
 * would be re-encoded on the next render and compound.
 */
export function stripMarkers(value: string): string {
  return value.replace(MARKER_PATTERN, "");
}

export type FlatField = {
  index: number;
  section: string;
  key: string;
  label: string;
  kind: "text" | "textarea" | "image";
  hint?: string;
  maxLength?: number;
};

/**
 * A page's fields in canonical order — marker indexes are positions in this
 * flattened list. The server (encoding) and the overlay (decoding) must both
 * use this exact ordering, which is why it lives here rather than in either.
 */
export function flattenFields(
  sections: {
    key: string;
    label: string;
    fields: {
      key: string;
      label: string;
      kind: "text" | "textarea" | "image";
      hint?: string;
      maxLength?: number;
    }[];
  }[],
): FlatField[] {
  const out: FlatField[] = [];
  let index = 0;
  for (const section of sections) {
    for (const field of section.fields) {
      out.push({
        index: index++,
        section: section.key,
        key: field.key,
        label: `${section.label} — ${field.label}`,
        kind: field.kind,
        hint: field.hint,
        maxLength: field.maxLength,
      });
    }
  }
  return out;
}
