# Plant Profile Photo Orphan Cleanup

Admin-only, manually invoked CLI that identifies (and, only on explicit
opt-in, removes) orphaned **plant profile photo** objects in the
private `diary-photos` storage bucket.

- It **does not** inspect or delete diary entry photos, AI Doctor
  photos, gallery uploads, or any object outside the strict
  `<owner>/<grow|unassigned>/plant-profiles/<plant>/<file>` path.
- It is **manually invoked**. There is no schedule, cron, workflow
  trigger, or admin UI.
- **Dry-run is the default.** Destructive execution requires two
  explicit flags.

## Required environment

The script talks to Supabase with the service-role key. It is
**server/operator only** — never a browser, never a CI job that
publishes logs, never a `VITE_*` variable.

| Variable                    | Purpose                                        |
| --------------------------- | ---------------------------------------------- |
| `SUPABASE_URL`              | Project URL for the target environment.        |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role. Never commit, never ship to UI. |

Do **not** use `VITE_SUPABASE_*` values here. Do not paste the
service-role key into shell history that is retained or shared.

## Command examples

```bash
# Default dry-run, 30-day age threshold
bun run plant-photos:cleanup

# Explicit dry-run with a larger age threshold
bun run plant-photos:cleanup -- \
  --dry-run \
  --min-age-days 45

# Owner-filtered dry-run (recommended first step in prod)
bun run plant-photos:cleanup -- \
  --dry-run \
  --owner <owner-uuid> \
  --min-age-days 30

# Confirmed execute mode — both destructive flags required
bun run plant-photos:cleanup -- \
  --execute \
  --confirm-delete-orphans \
  --min-age-days 30
```

> **Never run execute mode before reviewing a successful dry-run from
> the same environment, owner scope, and age threshold.**

## Safety gates (all enforced in code)

- **Dry-run by default.** If `--execute` is not passed, the tool
  scans and reports only.
- **30-day default minimum age.** Younger objects are always
  protected.
- **7-day absolute minimum.** Any `--min-age-days` below 7 is
  rejected. There is no override flag.
- **Two destructive flags.** Deletion requires both `--execute`
  **and** `--confirm-delete-orphans`. Either alone is a no-op.
- **Incomplete scans fail closed.** If reference or storage listing
  is partial or errors, no deletion occurs.
- **Unknown-age objects are never deleted.** Missing / malformed /
  future-dated `created_at` classifies as `unknown_age`.
- **Final `plants.photo_url` recheck.** Immediately before deletion,
  the tool re-reads the reference set; anything newly referenced is
  stripped and reported under `protected_by_final_recheck`.
- **Strict plant-profile path scope.** Only
  `<owner>/<grow|unassigned>/plant-profiles/<plant>/<file>` objects
  are ever eligible.
- **No UI.** The script is not imported by any client bundle.
- **No scheduler.** No cron, no workflow trigger, no timers.

## JSON report fields

Every successful run writes a JSON report under
`artifacts/admin/plant-photos-cleanup-<timestamp>.json`.

| Field                        | Meaning                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `schema_version`             | Report schema version. Currently `"1"`.                              |
| `generated_at`               | ISO-8601 timestamp of the run.                                       |
| `mode`                       | `"dry_run"` or `"execute"`.                                          |
| `bucket`                     | Always `"diary-photos"`.                                             |
| `scope`                      | Always `"plant-profile-photos"`.                                     |
| `scan_complete`              | `false` if any listing failed / was partial. Deletion is blocked.    |
| `min_age_days`               | Age threshold that was applied.                                      |
| `owner_filter`               | Owner UUID scoping, or `null` when not scoped.                       |
| `counts`                     | See below.                                                           |
| `eligible_paths`             | Orphans that passed the initial scan (candidates).                   |
| `protected_by_final_recheck` | Paths removed from deletion by the final `plants.photo_url` recheck. |
| `deleted_paths`              | Paths actually deleted. Always `[]` in dry-run.                      |
| `failed_paths`               | Paths the storage API failed to remove during execute.               |
| `malformed_references`       | `plants.photo_url` values that could not be parsed.                  |
| `failures`                   | `{phase, message}` entries for scan/execute errors.                  |

### `counts` fields

| Field                        | Meaning                                                                    |
| ---------------------------- | -------------------------------------------------------------------------- |
| `plant_rows_scanned`         | Total `plants` rows examined for `photo_url`.                              |
| `valid_storage_references`   | `photo_url` values that resolve to a `storage://diary-photos/<path>`.      |
| `legacy_references`          | `http(s)`, `data:`, `blob:` values kept for backwards compatibility.       |
| `malformed_references`       | Non-empty `photo_url` values that could not be parsed.                     |
| `storage_objects_scanned`    | Total storage objects listed under the plant-profile scan scope.           |
| `referenced`                 | Storage objects still referenced by a `plants.photo_url`.                  |
| `eligible_orphans`           | Objects eligible under the scan rules — **not** necessarily deleted.       |
| `too_young`                  | Objects newer than `min_age_days`. Protected.                              |
| `unknown_age`                | Objects with missing / unparseable `created_at`. Never deleted.            |
| `invalid_path`               | Objects whose path is unsafe or malformed (`..`, `\\`, `/…`, dot-files).   |
| `non_profile_photo`          | Valid `diary-photos` objects **outside** the plant-profile scope.          |
| `owner_mismatch`             | Objects skipped because they belong to another owner under `--owner`.      |
| `protected_by_final_recheck` | Objects that became referenced after the initial scan.                    |
| `deletion_attempted`         | Paths the deleter was asked to remove. Always `0` in dry-run / incomplete. |
| `deleted`                    | Paths the storage API confirmed removed.                                   |
| `failed`                     | Paths the storage API failed to remove.                                    |

### Category invariants

- Dry-run reports **always** have `deletion_attempted = 0`,
  `deleted = 0`, and `deleted_paths = []`.
- `unknown_age`, `invalid_path`, `non_profile_photo`, and
  `protected_by_final_recheck` are always reported as distinct
  categories — they are never merged into a generic "protected"
  count.
- `unknown_age` and `invalid_path` objects are never deletion
  candidates.
- `non_profile_photo` objects are outside the cleanup scope and are
  never touched.
- Array counts always match their array lengths (`deleted ===
  deleted_paths.length`, etc.).

## Exit behavior

- `exit 0` — the run completed. In dry-run, this is the normal
  success. In execute mode, the run reached the end (including a
  no-op path when nothing was eligible).
- `exit 1` — execute mode aborted because `scan_complete` was
  `false`, or a fatal error occurred while running.
- `exit 2` — argument parsing failed, or the required environment
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) was missing.

## Rollback notes

- Deleted storage objects are **not** recoverable by reverting this
  script. Restore requires the underlying storage provider’s
  point-in-time recovery.
- Always begin execute mode with a small **owner-filtered** run and
  keep the generated JSON report for audit.
- If in doubt, run dry-run again with the same flags and diff the
  reports before flipping to `--execute`.
