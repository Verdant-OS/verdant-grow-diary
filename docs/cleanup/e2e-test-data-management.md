# E2E test data management

Playbook for keeping Playwright write smokes honest without polluting real
grower data. Complements [`e2e/README.md`](../../e2e/README.md) and
[`e2e/FIXTURE_SETUP.md`](../../e2e/FIXTURE_SETUP.md).

Related defects: leftover hunts on a real grow
([#570](https://github.com/Verdant-OS/verdant-grow-diary/issues/570)),
concatenated hunt names from prefills
([#569](https://github.com/Verdant-OS/verdant-grow-diary/issues/569)).

---

## 1. Split tests by write risk

| Risk               | Strategy                            | Examples                                                                        |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------- |
| **Read / UI only** | Mocks, fake session, public demos   | `pheno-comparison-*`, overflow, auth shells                                     |
| **Write**          | Disposable fixture account **only** | Quick Log smoke, `pheno-paid-journey` (paid), `pheno-workspace-state-integrity` |

Never mix: a write-producing path must not open a personal or production grow
“just to check.”

---

## 2. One fixture “garden”

| Item    | Rule                                                                     |
| ------- | ------------------------------------------------------------------------ |
| Account | Dedicated E2E user; **no real grower data**                              |
| Tent    | Exact `E2E Test Tent`                                                    |
| Plant   | Exact `E2E Test Plant` (+ optional `E2E Test Plant 2`)                   |
| Grow    | Prefer `E2E Test Grow` when the UI exposes a grow name                   |
| Hunts   | Always name via `buildE2eHuntName(purpose)` → `E2E <purpose> YYYY-MM-DD` |
| Target  | **Never** start a hunt from a real grow (e.g. Project McDonald)          |

Env flags: `E2E_FIXTURE_MODE=true`, expected tent/plant names, optional grow name.
See `e2e/lib/fixtureSafety.ts`.

---

## 3. Create / delete where safe

| Entity                          | Pattern                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Pheno hunts**                 | Create on fixture grow → assert → **delete hunt** in cleanup/`finally`                                                                    |
| **Diary / evidence Quick Logs** | Writes are **durable** (hunt delete does **not** remove diary). Only write on the fixture plant; prune manually when the diary gets noisy |
| **Archive plants**              | `pheno-workspace-state-integrity` may archive fixture plants; reseed/unarchive before rerun                                               |

Do not automate deletion of grower diary entries.

---

## 4. Never rely on “we’ll clean later”

If teardown cannot reverse a write (immutable diary, permanent candidate numbers),
the test **must not** target production-like grows. Prefer skip-when-unset over
writing into the wrong place.

---

## 5. CI / local gates

Before write smokes:

1. `E2E_FIXTURE_MODE` exactly `true`
2. Expected tent/plant names include `E2E` or `Test`
3. Plant URL (when used) is not a known production host
4. Discovered grow label is not on the **real-grow denylist** and includes
   `E2E`/`Test` markers

Helpers:

| Function                                             | Role                                              |
| ---------------------------------------------------- | ------------------------------------------------- |
| `validateFixtureEnv` / `validateQuickLogFixturePage` | Quick Log plant-detail fence                      |
| `assertPhenoWriteFixtureEnv`                         | Pheno write suites (plant URL optional)           |
| `assertGrowAllowedForWriteSmoke`                     | Denylist + marker check on grow labels            |
| `buildE2eHuntName`                                   | Prefixed hunt names (use `.fill()`, never append) |

Wired into:

- `e2e/quicklog-smoke.spec.ts` (existing)
- `e2e/pheno-paid-journey.spec.ts` (paid create path)
- `e2e/pheno-workspace-state-integrity.spec.ts`

---

## 6. When residue already exists (#570)

Manual owner steps (no automation against real diary rows):

1. Sign in as the account that owns the polluted grow.
2. On Timeline / Pheno section, **Delete** stale E2E hunts (names starting with
   `E2E`, `Codex Pro E2E`, `Claude E2E`, or concatenated prefills).
3. Accept that diary lines from evidence Quick Logs may remain — do not bulk-delete
   grower history from scripts.
4. If real and fixture data share one account, **rotate**: new E2E-only account,
   recreate `E2E Test Tent` / plant, update secrets/vars.
5. Re-point `E2E_GROW_1_PLANT_URL` and re-run `bun run e2e:verify-fixture`.

---

## 7. Quick checklist before any write smoke

- [ ] Fixture account only
- [ ] `E2E_FIXTURE_MODE=true`
- [ ] Tent/plant expected names set and visible
- [ ] Grow label passes denylist + markers
- [ ] Hunt names use `buildE2eHuntName` + full `.fill()`
- [ ] Cleanup deletes hunts you created when possible
- [ ] No evidence Quick Log on non-fixture plants

## 8. Automated garden rotation (CLI)

Pure planner: `scripts/e2e/e2e-fixture-rotation-core.mjs`  
CLI: `scripts/e2e/rotate-e2e-fixture.mjs`

```bash
# Dry-run (default) — discover + plan only
export VITE_SUPABASE_URL=...
export VITE_SUPABASE_PUBLISHABLE_KEY=...
export E2E_ROTATION_ACCESS_TOKEN=...   # fixture user JWT
# optional pin:
# export LOVABLE_E2E_TARGET_PROJECT_REF=...

bun run e2e:fixture:rotate:dry

# Delete only E2E-prefixed pheno hunts (dual confirm)
bun run e2e:fixture:rotate

# Then verify before write smokes
bun run e2e:verify-fixture
```

**Behavior**

| Situation                                             | Result                                              |
| ----------------------------------------------------- | --------------------------------------------------- |
| Grow named Project McDonald / Starter Grow / unmarked | **BLOCKED** — rotate account, do not wipe           |
| Clean garden with `E2E …` hunts                       | Plans/deletes those hunts only                      |
| Missing `E2E Test Tent` / plant                       | Reports `seed_missing` (create via UI or bootstrap) |
| Diary residue                                         | **Never** bulk-deleted                              |

Receipt line: `E2E_FIXTURE_ROTATION_JSON={...}` (no tokens/emails).
