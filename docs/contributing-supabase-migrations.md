# Contributing Supabase Migrations

This doc keeps `supabase/migrations/` consistent across branches and prevents
Supabase preview-branch failures of the form:

> Remote migration versions not found in local migrations directory.

Such failures happen when a feature branch is missing migration files that
already exist on the integration branch or in the remote
`supabase_migrations.schema_migrations` table.

---

## Branch ownership

| Branch                          | Role                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `dev` (integration)             | **Owns the complete active Supabase migration history.** Every migration that has reached preview lives here. |
| `main`                          | Owns released production history after merge from `dev`.                                                 |
| feature branches (`feat/...`)   | Add new migrations on top of `dev`. Must rebase from `dev` before opening or refreshing a PR.            |

If a project uses a different integration branch name, override via
`SUPABASE_MIGRATIONS_INTEGRATION_BRANCH=<name>` (see scripts below).

---

## Hard rules

1. **Never squash or drop migration files.** Once a migration has reached the
   integration branch, it stays — even if a later migration "supersedes" it.
2. **Never rename an existing migration after it has reached integration.**
   The filename's timestamp is part of Supabase's migration identity. Renaming
   breaks `schema_migrations` alignment.
3. **Older merged migration wins on conflict.** If two PRs add migrations and
   PR&nbsp;A merges first, PR&nbsp;B must rebase and keep both migrations — never
   delete or renumber PR&nbsp;A's file.
4. **Feature branches must rebase from the integration branch** before
   preview/deploy checks run. Otherwise Supabase preview will diverge from the
   remote migration history.
5. **PRs must run migration sync before preview checks.** This is enforced by
   the `supabase:migrations:verify-remote` script (CI) and can be done locally
   with `supabase:migrations:sync`.

---

## Workflow

### Before opening / refreshing a PR

```bash
# 1. Fetch + sync any migrations you're missing from the integration branch.
bun run supabase:migrations:sync          # default branch: dev
# or, explicitly:
SUPABASE_MIGRATIONS_INTEGRATION_BRANCH=dev bun run supabase:migrations:sync
# or via CLI flag:
node scripts/sync-supabase-migrations-from-integration.mjs --branch dev

# 2. Verify nothing is missing.
bun run supabase:migrations:verify-remote
```

The sync script only copies files that are **missing locally**. It never
overwrites a local file.

### Adding a new migration

1. Rebase from the integration branch first.
2. Create the migration via Lovable (preferred) or via
   `supabase migration new <name>`.
3. Confirm the new file appears in `supabase/migrations/` and is the
   newest timestamp.
4. Commit the migration with the PR. Do not edit migrations from other PRs.

### Resolving "Remote migration versions not found"

This means the remote `schema_migrations` table contains versions that the
PR branch does not. Fix path:

```bash
git fetch origin dev
bun run supabase:migrations:sync --branch dev
git status supabase/migrations
git add supabase/migrations
git commit -m "chore(supabase): sync migrations from dev"
```

If migrations are missing from `dev` itself, they must be added back to `dev`
from the canonical source (the merged PR branch or a `supabase db pull`
against the linked project) **before** any feature branch can sync.

---

## What this prevents

- PR preview branches failing because they were branched from an older `main`
  that lacks recently merged migrations.
- Silent loss of a migration because two PRs touched `supabase/migrations/`
  concurrently and one was rebased with `--ours`.
- Schema drift between local, preview, and production.
