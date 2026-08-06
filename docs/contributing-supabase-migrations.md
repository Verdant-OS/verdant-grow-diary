# Contributing Supabase Migrations

## Migration History Ownership

- The integration branch, e.g. `dev`, owns the complete active Supabase migration history.
- `main` owns released production history after merge.
- Feature branches must rebase from the integration branch before preview/deploy.

## Hard Rules

- Never squash/drop migration files.
- Never rename an existing migration after it has reached integration.
- If two PRs add migrations, the older merged migration stays; the newer PR must rebase and keep both.
- PRs must run migration sync before preview checks.

## Syncing Migrations

To sync migrations from the integration branch into your local branch without overwriting local changes:

```bash
npm run supabase:migrations:sync
```

This ensures that your local `supabase/migrations/` folder is up to date and won't fail CI checks or clobber the migration history during PR previews.
