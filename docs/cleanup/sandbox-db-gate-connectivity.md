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
   - GitHub-hosted runners are **IPv4-only** — avoid direct `db.<ref>.supabase.co`
     if that host is IPv6-only for your project
3. Confirm the URI is **sandbox**, not production (`knkwiiywfkbqznbxwqfh`).
4. Re-run:
   - Actions → **Required core schema present** → Run workflow (`sandbox`)
   - Actions → **Required money-critical migrations present** → Run workflow (`sandbox`)
5. Both jobs should report verified / applied, not `schema_query_failed` /
   `tracker_query_failed`.

## Related

- Zero-defect **#561** (MCP / preview also bind sandbox vs production)
- Identity pin: `scripts/lib/supabaseDatabaseTargetIdentity.mjs`
- Gates: `scripts/assert-required-core-migrations-applied.mjs`,
  `scripts/assert-required-money-migrations-applied.mjs`

## What agents cannot do

Rotate or rewrite GitHub environment secrets. Diagnostics and docs only until
the owner refreshes `SUPABASE_DB_URL_SANDBOX`.
