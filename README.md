# عقار | Aqar Kuwait

Arabic-first real estate and client management workspace for a Kuwait contracting and property company.

## Current implementation

- Responsive RTL dashboard and property inventory with search, status filters, KWD formatting, CSV export, theme toggle, and browser persistence for a quick local preview.
- Excel/CSV import wizard with a dedicated Web Worker, Arabic/English header matching, workbook sheet selection, 50 MB limit, macro-enabled file rejection, Kuwait phone cleanup, Arabic digit conversion, validation counts, and a 20-row preview.
- Supabase Postgres migration for normalized records, coded lookups, roles and permissions, audit history, import staging tables, search indexes, and row level security.
- Security headers and environment-based Supabase client helpers.

The included browser preview is not a substitute for a configured Supabase deployment. Data entered without Supabase is stored in the current browser only. The import UI currently writes validated property rows into that local preview. The migration defines the durable backend and staging model; a production background worker/Edge Function, transactional batch processor and rollback endpoint still need to be connected before importing a company's live 50k+ dataset. Do not use the local preview for production records.

## Requirements

- Node.js 20 or newer
- A Supabase project for hosted authentication and persistence

## Local setup

```bash
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. `SUPABASE_SERVICE_ROLE_KEY` must stay server-side and must never use a `NEXT_PUBLIC_` prefix. The app shell can be viewed without Supabase configuration; Supabase access helpers intentionally fail with a clear configuration message when called without credentials.

## Database and deployment

1. Create a Supabase project in a region suitable for your Kuwait users.
2. Apply `supabase/migrations/202611180001_initial_schema.sql` through the Supabase SQL editor or Supabase CLI migration workflow.
3. Enable email/password auth and configure your production site URL and redirect URLs in Supabase Auth.
4. Configure private Storage buckets for property images, documents, and original import files. Add bucket policies aligned with the property assignment scope.
5. Add the environment variables in Vercel Project Settings, connect the GitHub repository, and deploy. Keep the service role key in server-only runtime configuration.
6. Create the initial Super Admin profile and assign the `مدير النظام` role using a trusted administrative process.

## Roles and data access

The migration seeds Super Admin, Manager, Sales Agent, Call Center, Data Entry, Accountant, and Viewer roles plus module/action permissions. Row level security scopes records by assignment and applies permissions in PostgreSQL. Managers and Super Admins have broad access; phone and price visibility flags are represented on profiles for server-side field shaping. Exports must be implemented through a server endpoint that enforces the separate `export` permission and masks restricted fields. Never rely on hiding a UI button as authorization.

## Import pipeline notes

The browser parser accepts `.xlsx`, `.xls`, and `.csv`, rejects `.xlsm`, and supports UTF-8 plus Windows-1256 CSV decoding. Its current import wizard is a preview/local demonstration. The schema includes `import_batches`, `import_rows`, `import_mappings`, and `value_mappings` to support resumable server-side batches. Before importing live workbooks, implement an authenticated Edge Function or queue worker that validates staged rows in batches, performs each batch transactionally, checks duplicates, records before/after state, emits progress, and supports 30-day rollback. Store the original workbook in private Storage. Test that pipeline against a representative messy 50k+ workbook in a staging project.

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run typecheck` — TypeScript check
