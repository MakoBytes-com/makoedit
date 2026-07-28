/**
 * MakoEdit — the Mako Logics client content editor.
 *
 * Clients edit VALUES: text, images, links. Mako owns STRUCTURE: layout,
 * components, theme, SEO. That boundary is the product, not a limitation — it
 * removes the expensive, fragile half of a normal CMS (page builders, block
 * composition, theme editors) and leaves the half clients actually asked for.
 *
 * See README.md for how to add it to a site.
 */

export { createMakoEdit, type MakoEdit } from "./engine.js";
export { drizzleStore, type DrizzleAdapterOptions } from "./adapters/drizzle.js";
export { supabaseStore, type SupabaseAdapterOptions } from "./adapters/supabase.js";
export {
  decodeMarker,
  encodeMarker,
  flattenFields,
  MARKER_PATTERN,
  SITE_INDEX_OFFSET,
  stripMarkers,
  type FlatField,
} from "./stega.js";
export type {
  ContentMap,
  ContentRow,
  ContentStore,
  FieldDef,
  FieldEntry,
  FieldKind,
  MakoEditConfig,
  PageDef,
  SectionDef,
} from "./types.js";
