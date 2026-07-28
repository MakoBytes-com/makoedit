/**
 * Drizzle + Postgres storage adapter.
 *
 * This is the shape every fleet site already uses, so adopting MakoEdit on an
 * existing site is: run the migration, pass your db and table here, done.
 *
 * The adapter is deliberately tiny. If it grows, that is a sign something
 * site-specific is leaking into the engine.
 */

import type { ContentRow, ContentStore, FieldKind } from "../types.js";

type DrizzleLike = {
  select: () => {
    from: (t: unknown) => { where: (w: unknown) => Promise<Record<string, unknown>[]> };
  };
  insert: (t: unknown) => { values: (v: Record<string, unknown>) => Promise<unknown> };
  update: (t: unknown) => {
    set: (v: Record<string, unknown>) => { where: (w: unknown) => Promise<unknown> };
  };
  delete: (t: unknown) => { where: (w: unknown) => Promise<unknown> };
};

export type DrizzleAdapterOptions = {
  db: DrizzleLike;
  /** The content_fields table object from your schema. */
  table: Record<string, unknown>;
  /** drizzle-orm's `eq`. Passed in so this package never has to pin a
   *  drizzle-orm version against the site's. */
  eq: (col: unknown, value: unknown) => unknown;
};

export function drizzleStore({ db, table, eq }: DrizzleAdapterOptions): ContentStore {
  const col = (name: string) => (table as Record<string, unknown>)[name];

  return {
    async listRows(page: string): Promise<ContentRow[]> {
      const rows = await db.select().from(table).where(eq(col("page"), page));
      return rows.map((r) => ({
        id: r.id as number,
        page: r.page as string,
        section: r.section as string,
        fieldKey: r.fieldKey as string,
        kind: (r.kind ?? "text") as FieldKind,
        published: (r.published ?? null) as string | null,
        draft: (r.draft ?? null) as string | null,
      }));
    },

    async insertRow(row) {
      const now = new Date();
      await db.insert(table).values({
        page: row.page,
        section: row.section,
        fieldKey: row.fieldKey,
        kind: row.kind,
        draft: row.draft,
        published: row.published,
        updatedBy: row.updatedBy ?? null,
        updatedAt: now,
        createdAt: now,
      });
    },

    async updateRow(id, patch) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      // Explicit key checks, not truthiness — `draft: null` is a meaningful
      // value (it clears the draft) and would be dropped by a falsy test.
      if ("draft" in patch) set.draft = patch.draft;
      if ("published" in patch) set.published = patch.published;
      if ("kind" in patch) set.kind = patch.kind;
      if ("updatedBy" in patch) set.updatedBy = patch.updatedBy ?? null;
      await db.update(table).set(set).where(eq(col("id"), id));
    },

    async deleteRow(id) {
      await db.delete(table).where(eq(col("id"), id));
    },
  };
}
