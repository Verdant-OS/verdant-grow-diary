# Sandbox DB gate connectivity (core schema + money migrations)

**Status (2026-08-08):** Both remote sandbox gates fail after identity proof with
`psql` exit status **2**. This is **not** app-code schema drift and cannot be
fixed by dependency overrides.

| Workflow                                     | Job                                        | Secret                                                 | Pinned project         |
| -------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ | ---------------------- |
| `Required core schema present`               | Verify pinned Verdant sandbox schema       | `SUPABASE_DB_URL_SANDBOX` in env **`verdant-sandbox`** | `bzatgtgjvuojpoxcknaa` |
| `Required money-critical migrations present` | Assert money migrations applied in SANDBOX | same                                                   | same                   |

## What the failure means

Audit evidence (tip runs after 2026-08-07 ~20:11 UTC):

1. **Identity OK** — URL parses, project ref matches sandbox pin, connection mode
   is typically `shared-supavisor-session`.
2. **`psql` status 2** — connection never established or session dropped.
   Schema / migration tracker was **not** read; treat applied state as unknown.
3. **Not missing secret** — preflight and identity would fail earlier if the
   secret were empty or pointed at the wrong project.

Last known green sandbox core/money remote jobs: **2026-08-07 ~19:10 UTC**.

## Owner fix (required)

1. Open **Settings → Environments → `verdant-sandbox`**.
2. Refresh **`SUPABASE_DB_URL_SANDBOX`** with a **current** Postgres URI from
   Supabase project **`bzatgtgjvuojpoxcknaa`** (sandbox / “Verdant”):
   - Prefer **Session pooler** host (`aws-…pooler.supabase.com`, port 5432)
   - Username form **`postgres.<project-ref>`** (or Dashboard “Session mode” copy)
   - Password: database password (rotate if unsure)
   - GitHub-hosted runners are **IPv4-only** — see **IPv6 fallback** below if the
     direct host is IPv6-only
3. Confirm the URI is **sandbox**, not production (`knkwiiywfkbqznbxwqfh`).
4. Re-run:
   - Actions → **Required core schema present** → Run workflow (`sandbox`)
   - Actions → **Required money-critical migrations present** → Run workflow (`sandbox`)
5. Both jobs should report verified / applied, not `schema_query_failed` /
   `tracker_query_failed`.

## IPv6 fallback (GitHub-hosted runners)

GitHub-hosted Actions runners are **IPv4-only**. If the Dashboard “direct”
connection string resolves only to an **AAAA** (IPv6) address, `psql` on CI
will hang or exit **2** even when the password and project ref are correct.
Identity can still pass (URL shape + pinned ref) before the TCP session fails.

### Detect IPv6-only direct host

From a dual-stack machine (your laptop), with the project ref substituted:

```bash
# Direct host — if this prints only AAAA and no A, CI cannot dial it.
dig +short A    db.bzatgtgjvuojpoxcknaa.supabase.co
dig +short AAAA db.bzatgtgjvuojpoxcknaa.supabase.co

# Pooler host — should show A (IPv4). Prefer this for CI secrets.
dig +short A    aws-0-us-east-1.pooler.supabase.com   # region as shown in Dashboard
```

Interpretation:

| Direct `A` | Direct `AAAA` | CI outlook                                                                 |
| ---------- | ------------- | -------------------------------------------------------------------------- |
| present    | any           | Direct URI may work on runners                                             |
| empty      | present       | **IPv6-only** — do **not** put direct `db.<ref>.supabase.co` in CI secrets |
| empty      | empty         | DNS / wrong host — fix Dashboard copy before rotating the secret           |

### Fallback URI for CI (preferred)

When direct is IPv6-only (or you want CI to stay on the path identity already
accepts), store a **Session pooler** URI in `SUPABASE_DB_URL_SANDBOX`:

1. Supabase Dashboard → project **`bzatgtgjvuojpoxcknaa`** → **Project Settings →
   Database → Connection string**.
2. Choose **Session mode** (port **5432**) on the **pooler** host
   (`aws-<n>-<region>.pooler.supabase.com`), **not** “Direct connection”.
3. Username must be **`postgres.bzatgtgjvuojpoxcknaa`** (or the Dashboard
   Session-mode form). Do not use bare `postgres` on the shared pooler.
4. Paste the full `postgres://…` / `postgresql://…` URI (password filled in) into
   the **`verdant-sandbox`** environment secret **`SUPABASE_DB_URL_SANDBOX`**.
5. Optional local smoke (never commit the URL):

   ```bash
   # Must exit 0 and print a version row; use the same URI you will store as the secret.
   export SUPABASE_DB_URL='postgresql://postgres.bzatgtgjvuojpoxcknaa:…@aws-….pooler.supabase.com:5432/postgres'
   export TARGET_ENV=sandbox
   psql -X -A -t -v ON_ERROR_STOP=1 -c 'select 1'
   # Then re-run the gate scripts against that env if you have psql + the repo checked out.
   ```

Identity gate notes (already enforced in code):

- Shared pooler URLs are bound to the pinned project via the username rewrite
  (`postgres.<project-ref>`).
- Direct hosts must be `db.<project-ref>.supabase.co` on 5432/6543 with user
  `postgres`.

### If you must keep a direct URI

Only if `dig +short A db.<ref>.supabase.co` returns at least one **IPv4**
address for sandbox. Otherwise CI will keep failing with `psql` status 2 and
no schema verdict. There is no runner-side IPv6 toggle for standard
`ubuntu-latest` hosted runners.

### After rotating for IPv6

1. Re-run **Required core schema present** and **Required money-critical
   migrations present** on `verdant-grow-diary` (workflow_dispatch → sandbox).
2. Confirm logs show identity verified and **not** `schema_query_failed` /
   `tracker_query_failed`.
3. Optionally re-check production secrets the same way before a live dispatch
   (`SUPABASE_DB_URL` on **`verdant-production`**, project `knkwiiywfkbqznbxwqfh`).

## Related

- Zero-defect **#561** (MCP / preview also bind sandbox vs production)
- Identity pin: `scripts/lib/supabaseDatabaseTargetIdentity.mjs`
- Gates: `scripts/assert-required-core-migrations-applied.mjs`,
  `scripts/assert-required-money-migrations-applied.mjs`

## What agents cannot do

Rotate or rewrite GitHub environment secrets. Diagnostics and docs only until
the owner refreshes `SUPABASE_DB_URL_SANDBOX`.
