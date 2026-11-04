# Test data in a real grower account (grower bug item 20)

Status: **list only. Nothing here deletes, archives or edits data.** Written
2026-11-04 for the owner. Agents do not run this against production.

## What happened

The 2026-11-03 tent walks found test and QA records in a real grower account,
for example: `UX Audit Test`, `QA Audit Tent (synthetic)`, `QA-Tent-2`,
`QA Tent Save Retrieve`.

- `established fact`: no repository spec or script creates those names
  (searched `e2e/`, `scripts/`, `tools/`, `.claude/` on 2026-11-04). They look
  hand-entered during QA or audit sessions on the live site.
- `established fact`: the production Quick Log write smoke was pinned to the
  owner's own account (`e2e/lib/productionQuickLogFixtureRules.ts`, before
  this change). It wrote only `[smoke <time>]` notes to fixture rows whose names
  carry an E2E/Test/QA marker, but those rows lived in a real account.
- The newer rule (`docs/production-only-verification-runbook.md:8`) is a
  disposable test account only, never `cheekhimself@gmail.com` or
  `matt@verdantgrowdiary.com`. The write smoke now enforces that.

## List the candidates (read-only)

Run in the Supabase SQL editor **as the owner**, replacing the uuid with the
account's `auth.users.id`. It selects only; it changes nothing.

```sql
-- Read-only: grows, tents and plants whose names look like test data.
with owner as (select '00000000-0000-0000-0000-000000000000'::uuid as id),
pattern as (
  select '(^|[^a-z0-9])(e2e|test|qa|audit|synthetic|smoke|fixture)([^a-z0-9]|$)' as re
)
select 'grow' as kind, g.id, g.name, null::uuid as grow_id, g.is_archived, g.created_at
from public.grows g, owner, pattern
where g.user_id = owner.id and g.name ~* pattern.re
union all
select 'tent', t.id, t.name, t.grow_id, t.is_archived, t.created_at
from public.tents t, owner, pattern
where t.user_id = owner.id and t.name ~* pattern.re
union all
select 'plant', p.id, p.name, p.grow_id, p.is_archived, p.created_at
from public.plants p, owner, pattern
where p.user_id = owner.id and p.name ~* pattern.re
order by kind, created_at;
```

Also check for smoke notes:

```sql
-- Read-only: diary entries written by the Quick Log smoke.
select id, grow_id, plant_id, entry_at, left(note, 80) as note
from public.diary_entries
where user_id = '00000000-0000-0000-0000-000000000000'::uuid
  and note like '[smoke %'
order by entry_at desc;
```

The pattern can match real names (for example a plant called "QA Pheno").
Review every row before acting. Archiving in the app keeps history and is
reversible; deletion is not.

## What changed so it does not happen again

- The production Quick Log write smoke requires
  `E2E_FIXTURE_EXPECTED_ACCOUNT_HINT` to name a disposable test account, and
  refuses `cheekhimself@gmail.com` and `matt@verdantgrowdiary.com`
  (`PERSONAL_ACCOUNT_EMAILS`). The signed-in server identity must equal that
  account before any save.
- Until the disposable account exists, with its own `E2E Test` grow, tent and
  plant and the GitHub variables set (see `e2e/FIXTURE_SETUP.md`), the
  production write smoke stops before writing.
- Hand-driven QA sessions on the live site are outside repository tooling. They
  should sign in as the same disposable account.
