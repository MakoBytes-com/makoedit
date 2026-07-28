/**
 * MakoEdit engine.
 *
 * Everything here is site-agnostic. The only thing a site supplies is its page
 * registry and a storage adapter — which is why adding client editing to a new
 * site is a content task, not a build task.
 *
 * Extracted 2026-07-28 from utilities-plus.com, which had the most evolved
 * version of this pattern in the fleet. bndtrentals.com had a simpler one. Two
 * hand-built implementations of the same idea was the signal to extract.
 */

import type {
  ContentMap,
  ContentRow,
  FieldDef,
  FieldEntry,
  MakoEditConfig,
  PageDef,
} from "./types.js";
import { encodeMarker, flattenFields, SITE_INDEX_OFFSET, stripMarkers } from "./stega.js";

export function createMakoEdit(config: MakoEditConfig) {
  const {
    pages,
    store,
    revalidate,
    isDraft,
    adminBasePath = "/admin/pages",
    onError = (msg, err) => console.error(`[makoedit] ${msg}`, err),
  } = config;

  const getPageDef = (slug: string): PageDef | undefined =>
    pages.find((p) => p.slug === slug);

  async function rowsByName(page: string) {
    const rows = await store.listRows(page);
    const map = new Map<string, ContentRow>();
    for (const row of rows) map.set(`${row.section}.${row.fieldKey}`, row);
    return map;
  }

  /**
   * Content for a public page: registry defaults with saved values merged over
   * them. In Draft Mode unpublished drafts win, so an admin previewing sees
   * exactly what publishing would produce.
   *
   * NEVER throws. If the database is unreachable the page renders its
   * hardcoded defaults — a client site must not go blank because a content
   * row is missing or Postgres is having a bad minute.
   */
  async function getPageContent(page: string): Promise<ContentMap> {
    const def = getPageDef(page);
    const map: ContentMap = {};
    if (def) {
      for (const section of def.sections) {
        for (const field of section.fields) {
          map[`${section.key}.${field.key}`] = field.default;
        }
      }
    }

    let draft = false;
    try {
      draft = await isDraft();
    } catch {
      // draftMode() throws outside a request scope (sitemap build, for
      // example) — treat as published.
    }

    try {
      for (const row of await store.listRows(page)) {
        const key = `${row.section}.${row.fieldKey}`;
        const value = draft ? (row.draft ?? row.published) : row.published;
        if (value !== null && value !== undefined && value !== "") {
          map[key] = value;
        }
      }
    } catch (err) {
      onError(`falling back to defaults for "${page}"`, err);
    }

    // Draft Mode only: append invisible field markers so the visual editor can
    // map clicked text back to its field. Image URLs are never marked (it would
    // corrupt src) and *_alt fields stay clean so alt attributes are readable
    // by screen readers — those are edited through the image popover instead.
    if (draft && def) {
      const offset = page === "site" ? SITE_INDEX_OFFSET : 0;
      for (const field of flattenFields(def.sections)) {
        if (field.kind === "image" || field.key.endsWith("_alt")) continue;
        const mapKey = `${field.section}.${field.key}`;
        const current = map[mapKey];
        if (typeof current === "string" && current.length > 0) {
          map[mapKey] = encodeMarker(current, field.index + offset);
        }
      }
    }

    return map;
  }

  /**
   * Save draft values. Unknown fields are ignored — only registry-declared
   * fields can be written, so a crafted POST cannot invent content. CRLF is
   * normalised and edit markers are stripped so they can never be persisted.
   *
   * Returns how many fields actually changed.
   */
  async function saveDraft(
    pageSlug: string,
    entries: FieldEntry[],
    userId: number | string,
  ): Promise<number> {
    const def = getPageDef(pageSlug);
    if (!def) throw new Error(`unknown page "${pageSlug}"`);

    // Explicitly typed: inferring from the template literal gives a
    // `${string}.${string}` key type, which then rejects an ordinary string.
    const byName = new Map<string, FieldDef>(
      def.sections.flatMap((s) =>
        s.fields.map((f) => [`${s.key}.${f.key}`, f] as [string, FieldDef]),
      ),
    );
    const existing = await rowsByName(pageSlug);
    let changed = 0;

    for (const entry of entries) {
      const name = `${entry.section}.${entry.key}`;
      const field = byName.get(name);
      if (!field) continue; // not a registered field — ignore

      let value = stripMarkers(String(entry.value)).replace(/\r\n/g, "\n");
      // Enforce the declared limit server-side too. The editor shows a live
      // counter, but a limit that only exists in the UI is not a limit.
      if (field.maxLength && value.length > field.maxLength) {
        value = value.slice(0, field.maxLength);
      }

      const row = existing.get(name);
      const publishedValue = row?.published ?? null;
      const currentState = row?.draft ?? publishedValue ?? field.default;
      if (value === currentState) continue; // nothing new

      if (row) {
        // Editing back to the published value clears the draft rather than
        // storing a draft identical to what is already live.
        const draftValue = value === (publishedValue ?? field.default) ? null : value;
        await store.updateRow(row.id, {
          draft: draftValue,
          kind: field.kind,
          updatedBy: userId,
        });
      } else {
        if (value === field.default) continue; // still the hardcoded default
        await store.insertRow({
          page: pageSlug,
          section: entry.section,
          fieldKey: entry.key,
          kind: field.kind,
          draft: value,
          published: null,
          updatedBy: userId,
        });
      }
      changed++;
    }

    revalidate(`${adminBasePath}/${pageSlug}`);
    return changed;
  }

  /** Copy every draft on a page to published, then revalidate its routes. */
  async function publishPage(
    pageSlug: string,
    userId: number | string,
  ): Promise<number> {
    const def = getPageDef(pageSlug);
    if (!def) throw new Error(`unknown page "${pageSlug}"`);

    let published = 0;
    for (const row of (await rowsByName(pageSlug)).values()) {
      if (row.draft === null) continue;
      await store.updateRow(row.id, {
        published: row.draft,
        draft: null,
        updatedBy: userId,
      });
      published++;
    }

    if (published > 0) {
      for (const p of def.revalidatePaths ?? [def.path]) revalidate(p);
      revalidate(`${adminBasePath}/${pageSlug}`);
    }
    return published;
  }

  /** Throw away every draft on a page. Published content is untouched. */
  async function discardPage(pageSlug: string): Promise<number> {
    const def = getPageDef(pageSlug);
    if (!def) throw new Error(`unknown page "${pageSlug}"`);

    let discarded = 0;
    for (const row of (await rowsByName(pageSlug)).values()) {
      if (row.draft === null) continue;
      if (row.published === null) {
        // The row existed only to hold a draft — remove it entirely so the
        // page returns to rendering its hardcoded default.
        await store.deleteRow(row.id);
      } else {
        await store.updateRow(row.id, { draft: null });
      }
      discarded++;
    }

    revalidate(`${adminBasePath}/${pageSlug}`);
    return discarded;
  }

  /** Does this page have unpublished changes? Drives the "Draft" badge. */
  async function hasDraft(pageSlug: string): Promise<boolean> {
    try {
      return (await store.listRows(pageSlug)).some((r) => r.draft !== null);
    } catch (err) {
      onError(`draft check failed for "${pageSlug}"`, err);
      return false;
    }
  }

  /**
   * The field manifest the on-page overlay needs: every field in canonical
   * marker order. Serve this from a session-guarded route.
   */
  function manifest(pageSlug: string) {
    const def = getPageDef(pageSlug);
    if (!def) return null;
    const offset = pageSlug === "site" ? SITE_INDEX_OFFSET : 0;
    return {
      slug: def.slug,
      path: def.path,
      label: def.label,
      fields: flattenFields(def.sections).map((f) => ({ ...f, index: f.index + offset })),
    };
  }

  return {
    pages,
    getPageDef,
    getPageContent,
    saveDraft,
    publishPage,
    discardPage,
    hasDraft,
    manifest,
  };
}

export type MakoEdit = ReturnType<typeof createMakoEdit>;
