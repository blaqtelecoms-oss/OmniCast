# Supabase backend

The app runs on its own Supabase project: the tables, the private media buckets,
the two functions the desktop companion calls, and Supabase Auth for sign-in.
`base44/` keeps the previous backend's entity and function definitions for
reference only — nothing reads them at runtime any more.

## What is where

| App area | Before | Now |
| --- | --- | --- |
| Data | Base44 entities | `public.*` tables (`supabase/schema.sql`), original ids kept |
| Media | Base44 private storage | private buckets `beam-images`, `beam-videos`, `avatars`, `attachments`; records hold `bucket/path` and are read through signed URLs |
| Companion relay | `deviceService`, `helperRelay` functions | Edge Functions `device-service`, `helper-relay` |
| Sign-in | Base44 auth | Supabase Auth (email + password; Google once the provider is enabled) |
| Client | `@base44/sdk` | `src/api/supabaseBackend.js`, which keeps the `base44` call surface the pages already use |

Only the publishable (anon) key reaches the browser. Row level security decides
what a signed-in person can read and write, and every bucket is private.

## Commands

```bash
# schema, buckets, rows, media, then a count check for every table
node supabase/migrate.mjs

# just one stage
node supabase/migrate.mjs --schema
node supabase/migrate.mjs --data
node supabase/migrate.mjs --verify

# deploy the two Edge Functions
node supabase/deploy-functions.mjs
```

Both scripts read `SUPABASE_ACCESS_TOKEN`, `VITE_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `BASE44_APP_ID` and `BASE44_ADMIN_TOKEN` from the
environment. Nothing is deleted from the previous backend, so it stays a rollback
source.

Re-running is safe: rows are upserted by their original id, buckets and policies
are created only when missing.

## Notes for whoever picks this up

- **Media that could not be copied.** The seven `beam_media` rows still point at
  the previous backend's storage and are reported as `unavailable` by the
  migration: that backend's file endpoint answers `object not found` for them
  even with admin credentials, so their bytes could not be read. Those rows were
  left untouched rather than pointed at a location that does not exist.
- **Existing accounts have no password.** Profiles keep their original id and are
  linked to a Supabase Auth account by email, but a password hash cannot be
  carried across. Each person needs a password reset (needs SMTP configured in
  the project) or Google sign-in (needs the provider enabled).
- **Email confirmation is off** (`mailer_autoconfirm`), so a new signup is signed
  in immediately instead of waiting for a message the project cannot send yet.
- **Two-factor**: authenticator-app factors work through Supabase MFA. Text
  message codes and remembered devices need an SMS provider and are reported as
  unavailable in the UI.
- The `/oauth-consent` page belonged to the previous platform's MCP flow and is
  not routed by this app.
