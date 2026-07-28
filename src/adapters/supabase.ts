/**
 * supabase-js storage adapter.
 *
 * For fleet sites that talk to Postgres through supabase-js rather than
 * Drizzle. Same table, same columns — only the client differs.
 *
 * Use a SERVER-SIDE client. MakoEdit runs entirely in server components and
 * server actions; a browser client here would expose write access to content.
 */

import type { ContentRow, ContentStore, FieldKind } from "../types.js";

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => Promise<{ data: unknown[] | null; error: unknown }>;
    };
    insert: (rows: Record<string, unknown>) => Promise<{ error: unknown }>;
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
    };
    delete: () => {
      eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
    };
  };
};

export type SupabaseAdapterOptions = {
  client: SupabaseLike;
  /** Defaults to "content_fields". */
  table?: string;
};

export function supabaseStore({
  client,
  table = "content_fields",
}: SupabaseAdapterOptions): ContentStore {
  return {
    async listRows(page: string): Promise<ContentRow[]> {
      const { data, error } = await client
        .from(table)
        .select("id, page, section, field_key, kind, published, draft")
        .eq("page", page);
      // Thrown, not swallowed — getPageContent catches it and falls back to
      // registry defaults. Returning [] here would look like "no content".
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id as number,
          page: row.page as string,
          section: row.section as string,
          fieldKey: row.field_key as string,
          kind: (row.kind ?? "text") as FieldKind,
          published: (row.published ?? null) as string | null,
          draft: (row.draft ?? null) as string | null,
        };
      });
    },

    async insertRow(row) {
      const now = new Date().toISOString();
      const { error } = await client.from(table).insert({
        page: row.page,
        section: row.section,
        field_key: row.fieldKey,
        kind: row.kind,
        draft: row.draft,
        published: row.published,
        updated_by: row.updatedBy ?? null,
        updated_at: now,
        created_at: now,
      });
      if (error) throw error;
    },

    async updateRow(id, patch) {
      const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("draft" in patch) set.draft = patch.draft;
      if ("published" in patch) set.published = patch.published;
      if ("kind" in patch) set.kind = patch.kind;
      if ("updatedBy" in patch) set.updated_by = patch.updatedBy ?? null;
      const { error } = await client.from(table).update(set).eq("id", id);
      if (error) throw error;
    },

    async deleteRow(id) {
      const { error } = await client.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}
