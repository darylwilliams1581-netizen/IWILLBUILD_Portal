# Starter Pack Seed Data

This directory is the **single source of truth** for all starter pack content that gets seeded into new companies.

The app reads these JSON files at runtime (via `src/server/lib/seed-starter-pack.ts`).
At build time, `scripts/publish-build.mjs` copies this entire directory to `dist/server/seed/` so the production server can read it.

---

## Directory structure

```
src/server/seed/starter-packs/
└── default/
    ├── cost-guide.json    ← cost guide line items (27 items)
    ├── fleet.json         ← sample fleet asset
    ├── forms.json         ← form template definitions
    ├── project.json       ← sample project / job
    ├── safety.json        ← SWMS templates + safety plan
    └── stakeholders.json  ← sample customer + subcontractor
```

---

## How seeding works

1. When a new company is created, `seedStarterPack(companyId)` is called automatically.
2. The seeder reads JSON from this directory (or `dist/server/seed/` in production).
3. Each section is idempotent — it skips rows that already exist by name/title.
4. The `companies.starter_pack_loaded` flag prevents double-seeding.
5. Owner Console → Starter Pack tab shows seed status for any company.

---

## Editing starter pack content

Edit the JSON files in this directory directly. Changes take effect for all **new** companies from the next deploy.

To re-seed an existing company: reset `starter_pack_loaded = 0` in the DB and call the seed endpoint from Owner Console.

---

## Source documents (SWMS, policies, forms)

The original `.docx` source documents (SWMS templates, policies, forms) are **not part of the application**.
They are stored outside the deploy package in `/private/iwillbuild-dev-assets/source-docx/`.

To update seed content from a source document:
1. Extract the relevant content from the DOCX.
2. Edit the appropriate JSON file in this directory (`safety.json` for SWMS, `forms.json` for form templates, etc.).
3. Deploy — the updated seed data will be used for all new companies.

The `content/` directory (authoring workspace) is excluded from the deploy package entirely.
The app **never reads from `content/`** at runtime.
