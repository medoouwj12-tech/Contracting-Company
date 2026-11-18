# عقار | Aqar Kuwait

Arabic-first real estate and client management workspace for a Kuwait contracting and property company.

## Current implementation

- Responsive RTL dashboard and property inventory with search, status filters, KWD formatting, CSV export, theme toggle, and browser persistence for a quick local preview.
- Supabase email/password login, password reset request, protected routes when Supabase is configured, and transactional property creation linked to client contacts.
- Property detail drawer with status workflow, favorites and archive action; client contact cards with call and WhatsApp actions; follow-up and appointment creation and completion.
- Excel/CSV import wizard with a dedicated Web Worker, Arabic/English header matching, workbook sheet selection, 50 MB limit, macro-enabled file rejection, Kuwait phone cleanup, Arabic digit conversion, validation counts, and a 20-row preview.
- Supabase Postgres migration for normalized records, coded lookups, roles and permissions, audit history, import staging tables, search indexes, and row level security.
- Security headers and environment-based Supabase client helpers.

The included browser preview is not a substitute for a configured Supabase deployment. Data entered without Supabase is stored in the current browser only. The local preview is browser-only and capped for demonstration; do not use it for company production records. Connected imports stage rows in Supabase and process them transactionally in batches of up to 500. Duplicate property codes can be skipped, updated with a saved prior snapshot, or imported as a separate record with a generated suffix. Managers can roll back a batch within 30 days.

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
2. For a new project, apply both files in `supabase/migrations` in filename order. For a database that already applied the initial schema, apply `202611180002_import_duplicate_strategy.sql`. Use Supabase CLI migration tracking for repeatable deployments.
3. Enable email/password auth and configure your production site URL and redirect URLs in Supabase Auth.
4. Register the first user, then promote that account in the Supabase SQL editor:

   ```sql
   update public.profiles
   set role_id = (select id from public.roles where name = 'super_admin'),
       phone_visible = true,
       price_visible = true
   where email = 'admin@your-company.com';
   ```

5. Configure private Storage buckets for property images, documents, and original import files. Add bucket policies aligned with the property assignment scope.
6. Add the environment variables in Vercel Project Settings, connect the GitHub repository, and deploy. Keep the service role key in server-only runtime configuration.

## Roles and data access

The migration seeds Super Admin, Manager, Sales Agent, Call Center, Data Entry, Accountant, and Viewer roles plus module/action permissions. Row level security scopes records by assignment and applies permissions in PostgreSQL. Managers and Super Admins have broad access. Phone visibility is enforced by RLS; price is exposed through the `properties_safe` view according to the profile's `price_visible` flag, while direct access to the price column is revoked. Exports must be implemented through a server endpoint that enforces the separate `export` permission and masks restricted fields. Never rely on hiding a UI button as authorization.

## Import pipeline notes

The browser parser accepts `.xlsx`, `.xls`, and `.csv`, rejects `.xlsm`, and supports UTF-8 plus Windows-1256 CSV decoding. Connected imports stage mapped rows in `import_batches` and `import_rows`, then process rows through authenticated, permission-checked PostgreSQL RPCs in batches of up to 500. Row status and batch totals are stored for audit and resume; duplicate code policies are skip, update with before-state, or create with a generated code suffix. A manager or super admin can roll back created and updated property records for 30 days. The original workbook is not yet stored in private Storage. The synthetic parser test covers 50,250 rows, but the RPC pipeline still requires validation against a configured staging Supabase project before production use.

## Scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run typecheck` — TypeScript check
