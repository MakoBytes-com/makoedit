/**
 * MakoEdit — types.
 *
 * The registry declares every editable field on a site: its plain-English
 * label, input kind, and the exact value currently hardcoded in the page. The
 * admin renders editors from these definitions; public pages merge saved values
 * over the defaults, so a site with no rows in the database renders EXACTLY as
 * it does today.
 *
 * That property is the whole adoption story. Wiring MakoEdit into a site
 * changes nothing visible until somebody edits something, and removing every
 * row returns it to the hardcoded copy. There is no migration and no cutover.
 */

export type FieldKind = "text" | "textarea" | "image";

export type FieldDef = {
  /** Stable key within the section, e.g. "headline". NEVER rename once live —
   *  it is the database key, and renaming orphans the client's saved edit. */
  key: string;
  /** Plain-English label shown to the client, e.g. "Main headline".
   *  Written for the person editing, not the person who built the page. */
  label: string;
  kind: FieldKind;
  /** The exact value currently hardcoded in the component — the fallback when
   *  no row exists. Keep it in sync when you change the component. */
  default: string;
  /** Guidance shown under the input, e.g. "Keep under 60 characters." */
  hint?: string;
  /**
   * Maximum length, enforced in the editor with a live counter.
   *
   * Clients only edit VALUES, never structure — but a 400-character headline
   * pasted into a hero designed for 40 breaks a layout just as thoroughly as
   * editing CSS. The constraint is part of the field, not an afterthought.
   */
  maxLength?: number;
};

export type SectionDef = {
  /** Stable key, e.g. "hero". Never rename once live. */
  key: string;
  /** Plain-English section name shown as a card heading, e.g. "Hero banner". */
  label: string;
  fields: FieldDef[];
};

export type PageDef = {
  /** Registry slug, e.g. "home". Stored as content_fields.page. */
  slug: string;
  /** Public route, e.g. "/". Used for preview and revalidation. */
  path: string;
  /** Plain-English page name, e.g. "Home". */
  label: string;
  /** Paths revalidated on publish. Defaults to [path]. The shared "site"
   *  pseudo-page lists every route, because its fields render site-wide. */
  revalidatePaths?: string[];
  sections: SectionDef[];
};

/** Flat content map: "<section>.<fieldKey>" → value. */
export type ContentMap = Record<string, string>;

export type FieldEntry = { section: string; key: string; value: string };

/**
 * One stored field. Draft and published are separate columns so nothing a
 * client types is ever live until they press Publish.
 */
export type ContentRow = {
  id: number | string;
  page: string;
  section: string;
  fieldKey: string;
  kind: FieldKind;
  published: string | null;
  draft: string | null;
};

/**
 * Storage adapter.
 *
 * The ONLY thing that differs between fleet sites — some are Drizzle over
 * Postgres, some are supabase-js. Everything else in MakoEdit is identical
 * everywhere, which is exactly why this is the seam.
 */
export type ContentStore = {
  listRows(page: string): Promise<ContentRow[]>;
  insertRow(row: Omit<ContentRow, "id"> & { updatedBy?: number | string | null }): Promise<void>;
  updateRow(
    id: number | string,
    patch: Partial<Pick<ContentRow, "draft" | "published" | "kind">> & {
      updatedBy?: number | string | null;
    },
  ): Promise<void>;
  deleteRow(id: number | string): Promise<void>;
};

export type MakoEditConfig = {
  /** Every editable page on this site. */
  pages: PageDef[];
  store: ContentStore;
  /**
   * Called after a change so Next re-renders affected routes. Pass
   * `revalidatePath` from "next/cache".
   */
  revalidate: (path: string) => void;
  /**
   * Whether the request is in Draft Mode (admin preview). Pass a function
   * wrapping `draftMode()` from "next/headers". Must never throw — it is
   * called outside a request scope during sitemap builds.
   */
  isDraft: () => Promise<boolean>;
  /** Where admin page editors live. Defaults to "/admin/pages". */
  adminBasePath?: string;
  onError?: (message: string, err: unknown) => void;
};
