-- MakoEdit storage. One row per edited field.
--
-- A site with ZERO rows renders exactly as it does today, because every field
-- carries its current hardcoded value as the default in the registry. That is
-- the whole adoption story: installing MakoEdit changes nothing visible until
-- somebody edits something, and deleting every row reverts the site completely.
--
-- draft and published are SEPARATE columns on purpose. Nothing a client types
-- is live until they press Publish, and Discard throws the draft away without
-- touching what visitors see.

create table if not exists content_fields (
  id            serial primary key,

  -- Forward-compat for the Makopanel multi-tenant direction. Nullable today;
  -- becomes NOT NULL once a workspaces table lands.
  workspace_id  integer,

  -- Registry coordinates. page/section/field_key must match the registry
  -- exactly — renaming any of them orphans the client's saved edit, which is
  -- why the registry types say "never rename once live".
  page          varchar(80)  not null,
  section       varchar(80)  not null,
  field_key     varchar(120) not null,

  kind          varchar(20)  not null default 'text',

  published     text,
  draft         text,

  updated_by    integer,
  updated_at    timestamptz  not null default now(),
  created_at    timestamptz  not null default now()
);

-- One row per field. The upsert path relies on this to keep a field from
-- being written twice with divergent drafts.
create unique index if not exists content_fields_unique_field
  on content_fields (page, section, field_key);

-- Every read is "all rows for this page".
create index if not exists content_fields_page_idx
  on content_fields (page);

comment on table content_fields is
  'MakoEdit: client-editable field values. No row means the page renders its '
  'hardcoded default. draft is unpublished; published is live.';
comment on column content_fields.kind is
  'text | textarea | image. Mirrors the registry FieldDef so the editor knows '
  'which input to render without re-reading the registry.';
