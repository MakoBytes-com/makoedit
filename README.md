# MakoEdit

Client-safe content editing for Mako Logics fleet sites.

**Clients edit values. Mako owns structure.** Text, images and links are
editable. Layout, components, theme, page creation and SEO are not — permanently
and by design.

That boundary is the product, not a limitation. It removes the expensive,
fragile half of a normal CMS (page builders, block composition, theme editors)
and keeps the half clients actually ask for: *"can I change that headline and
swap this photo."*

---

## Why this exists

Two fleet sites had independently grown the same thing by hand —
`utilities-plus.com` (mature: registry, draft/publish, click-to-edit overlay)
and `bndtrentals.com` (simpler). A third client asked for it. Building it a
third time was the wrong answer.

This package is the engine from utilities-plus, generalised. The per-site part
— which strings and images are editable — stays in the site, because that is
genuinely different everywhere. Everything else is shared.

---

## The one property that makes adoption safe

**A site with no rows in the database renders exactly as it does today.**

Every field in the registry carries the page's *current hardcoded value* as its
default. Saved values are merged over those defaults. So:

- Installing MakoEdit changes nothing visible.
- Deleting every row reverts the site completely.
- If the database is unreachable, pages render their defaults rather than
  erroring. A client site never goes blank because content is missing.

There is no migration and no cutover. That is deliberate.

---

## Install

```bash
npm i github:MakoBytes-com/makoedit#v1
```

Pinned to the moving `v1` tag, so `npm update makoedit` picks up improvements
without ever crossing a major version.

Then run `migrations/0001_content_fields.sql` against the site's database.

---

## Wire it up (once per site)

```ts
// src/lib/content/index.ts
import { createMakoEdit, drizzleStore } from "makoedit";
import { revalidatePath } from "next/cache";
import { draftMode } from "next/headers";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { PAGES } from "./registry";

export const content = createMakoEdit({
  pages: PAGES,
  store: drizzleStore({ db, table: schema.contentFields, eq }),
  revalidate: revalidatePath,
  isDraft: async () => (await draftMode()).isEnabled,
});
```

Using supabase-js instead of Drizzle:

```ts
import { supabaseStore } from "makoedit";
store: supabaseStore({ client: createServerClient() }),
```

Use a **server-side** Supabase client. MakoEdit runs only in server components
and server actions; a browser client here would hand write access to content.

---

## Declare what's editable (the actual work)

One file per page. This is content work, not code work — you are listing which
strings and images a client may change, and what the limits are.

```ts
// src/lib/content/registry/home.ts
import type { PageDef } from "makoedit";

export const homePage: PageDef = {
  slug: "home",
  path: "/",
  label: "Home",
  sections: [
    {
      key: "hero",
      label: "Hero banner",
      fields: [
        {
          key: "headline",
          label: "Main headline",
          kind: "text",
          default: "Security you can actually rely on.", // must match the component
          maxLength: 60,
          hint: "Keep it under 60 characters or it wraps on mobile.",
        },
        { key: "photo", label: "Hero photo", kind: "image", default: "/images/hero.webp" },
        {
          key: "photo_alt",
          label: "Hero photo description (for screen readers)",
          kind: "text",
          default: "An installer fitting a door sensor",
        },
      ],
    },
  ],
};
```

Rules that matter:

- **`default` must match what the component renders today.** It is the fallback,
  and it is what "no edits" looks like.
- **Never rename `key` or `section` once live.** They are database keys —
  renaming orphans the client's saved edit and the page silently reverts.
- **Write `label` and `hint` for the client**, not for a developer.
- **Set `maxLength`.** A 400-character headline in a hero built for 40 breaks a
  layout exactly as thoroughly as editing CSS. The editor shows a live counter
  and the server truncates — a limit that only exists in the UI is not a limit.

Then read it in the page:

```tsx
const c = await content.getPageContent("home");
<h1>{c["hero.headline"]}</h1>
```

---

## How editing works

`text` and `textarea` fields get an invisible zero-width marker appended **in
Draft Mode only**. The on-page overlay decodes markers from DOM text nodes to
map what the client clicked back to its field — which is what makes
click-the-text editing work without annotating every component.

Markers never appear in published HTML (Draft Mode is admin-only), are stripped
on every write path so they can never be stored, and are appended at the end of
the value so wrapping and `whitespace-pre-line` are unaffected.

Image URLs and `*_alt` fields are never marked — a marker in a `src` would break
the image, and one in an `alt` would be read aloud by a screen reader.

---

## Draft → publish

```ts
await content.saveDraft("home", entries, userId);  // nothing goes live
await content.publishPage("home", userId);          // drafts → live, revalidates
await content.discardPage("home");                  // throw drafts away
await content.hasDraft("home");                     // drives the "Draft" badge
```

Nothing publishes implicitly. Editing a value back to what is already published
clears the draft instead of storing a duplicate.

---

## Not in scope, deliberately

- **SEO.** Titles, meta descriptions, canonicals, OG tags, JSON-LD, robots,
  sitemaps are Mako-owned and never exposed to a client role. Decided, closed.
- **Structure.** No page builder, no drag-and-drop, no block composition, no
  theme editor, no page creation or deletion.
- **Bishopbend Insurance.** Custom portal, and GLBA-regulated disclosure copy is
  a regulatory exposure rather than a broken-page risk. Out of scope for any
  forced adoption.

Adoption is **additive and opt-in, per content type, per site**. No site is ever
"brought in line". A design that only works if every site converges is the wrong
design — that constraint is what keeps bespoke client portals safe.

---

## Roadmap

- **AI guard** — tiered review of client edits. Code enforces the deterministic
  rules (lengths, image dimensions, link schemes); AI handles judgment. Highest
  value is liability, not typos: catching *"you just deleted the license
  number"* on a site carrying TX license B15560 and TCPA consent language.
  Never silently rewrite client content — suggest, client accepts.
- **Versions + rollback** beyond the single draft/published pair.
- **Audit trail** of who changed what, when.
- **Image constraints** enforced on upload: dimensions, aspect ratio, max size,
  AVIF/WebP conversion, and preserved width/height so CLS does not regress.

---

## Contributing

MIT licensed — see [LICENSE](LICENSE). Issues and pull requests welcome.

MakoEdit is extracted from production sites, so two things are load-bearing and
a PR that changes them needs a strong argument:

1. **A site with no rows must render exactly as it did before.** Every field
   carries the page's current hardcoded value as its default, and an
   unreachable database serves defaults rather than erroring. This is what
   makes it safe to install on a live client site.
2. **Clients edit values, never structure.** No page builder, no block
   composition, no theme editing, no SEO fields. Scope creep here is how a
   content editor becomes a way for a non-technical user to break a page.

`npm test` builds the package and runs the smoke suite (in-memory store, no
database needed). It covers draft isolation, publish, discard, marker
round-tripping, maxLength enforcement, unknown-field rejection, and the
database-down fallback. Keep it passing.
