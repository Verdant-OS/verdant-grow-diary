# Spec — Global search over diary entries

Status: **proposed spec only** (filming bug #17, 2026-10-22). No code in this slice.
**Owner decision (Matthew, 2026-10-22): Option B** — a server-side RPC, so the search text
travels in a POST body. The implementing slice adds it through a new additive migration,
drafted on its own branch for the protected migration review. No agent applies it;
production apply stays with the owner. Option A is recorded below only as the rejected
alternative.

## Problem

A grower searching the app for something they logged ("yellow leaves", "topped",
"cal-mag") gets no diary results. Search covers grows, tents, plants and the bundled
cultivar references only.

## Current behaviour (established fact, deploy tip `7b30f121`)

| Piece            | Source                                                                                               | What it searches                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private results  | `src/hooks/useGlobalSearch.ts:83` → RPC `verdant_search` (`supabase/migrations/20260723000807_…sql`) | `grows.name`, `tents.name`, `plants.name` **and `plants.strain`** for `auth.uid()`, non-archived plants (lines 41–65)                                                                   |
| Public results   | `searchCultivarReferences` (`src/lib/globalSearchResults.ts:63`)                                     | bundled cultivar constants                                                                                                                                                              |
| Navigation items | `GLOBAL_SEARCH_ITEMS` (`src/lib/globalSearchItems.ts:22`)                                            | **dormant data**: no runtime code imports it (`GlobalSearchDialog` and `useGlobalSearch` do not), so page links are not searched today; "diary" is only a keyword on its Quick Log item |
| Merge            | `mergeGlobalSearchResults` (`src/lib/globalSearchResults.ts:143`)                                    | exact → prefix → fuzzy ordering is preserved                                                                                                                                            |

Neither `diary_entries` nor `grow_events` is read by search. `GlobalSearchDialog` shows a row
only when `enabledTypes[row.entity_type]` is on (`src/components/GlobalSearchDialog.tsx:236`),
and its group order, default filters, restored session filters, icons, headings and route
switch know only grow / tent / plant / cultivar.

## Requirements

1. Match the grower's **own** logged notes on `note` text in **both** places a log lives:
   `grow_events` (every confirmed Quick Log save writes this spine row) and `diary_entries`.
   Companion presence depends on the writer, not on "structured details" as a single rule:
   - `quicklog_save_manual` always inserts a linked `diary_entries` mirror, even without
     details (`20260927160000_quicklog_manual_plant_tent_lineage.sql:211–229`). Empty notes
     become `'(quick log)'` on the mirror (`v_diary_note`).
   - The current `quicklog_save_event` wrapper always mirrors a write it accepts. It passes the
     delegate a non-empty internal details envelope (`__verdant_request_details_hash_v1` and
     `logged_at`; `20261001140000_quicklog_event_replay_mirrorless_legacy.sql:382–425`), so the
     delegate's `v_has_extra_details` check (`20260725023000_core_schema_forward_repair.sql:345–349`)
     is always true and `v_needs_diary` (lines 383–387) always holds. The envelope keys are
     stripped from the mirror's `details` afterwards (line 502). The wrapper's only other calls
     to the delegate (lines 132 and 312) pass validation failures through, and those write
     nothing. Empty notes use the same placeholder
     (`COALESCE(NULLIF(btrim(p_note), ''), '(quick log)')`).
   - The `v_needs_diary` gate (sensor snapshot, photo URL, extra details, water, or feed) decided
     mirroring only for event saves made before the dual-timestamp foundation
     (`20260725024026_quicklog_dual_timestamp_foundation.sql`). A note-only event saved then is
     spine-only.
   - Legacy rows can also be spine-only (the case `src/hooks/useGrowDetailData.ts:11–15`
     describes).

   Searching `diary_entries` alone would miss those spine-only logs. A diary row and its spine
   are one result, not two, under the same rules Timeline uses
   (`src/lib/timelineMergeRules.ts`):
   - linked by `details.linked_grow_event_id`, or by the legacy alias `details.grow_event_id`
     (`pickLogicalGrowEventLink`, lines 168–175);
   - or, for an older unlinked manual companion, sharing the exact (plant, instant) pair with
     a manual spine (lines 405–407).

   The result keeps the spine's id, since Timeline collapses the companion away. The placeholder
   `'(quick log)'` is not grower-authored text: exclude it only when
   `isQuickLogPlaceholderNote` (`src/lib/plantFeedingDisplayRules.ts:54`) is true (exact,
   trimmed, case-insensitive). A grower note that merely contains those words still matches.
   Naive `ilike '%quick%'` would otherwise hit empty-note mirrors.
   - Matching is a case-insensitive literal substring: `%`, `_` and `\` in the query match
     themselves.
   - Order is newest first (`occurred_at` / `entry_at`) with an `id` tie-break, bounded to
     **10** results in total.
   - Excluded: `grow_events` rows with `is_deleted` or `deleted_at` set, `diary_entries` rows
     with `retracted_at` set, and entries in archived grows. A non-retracted diary companion
     whose linked spine (by either link above) is deleted is excluded too: Timeline fetches a
     referenced-but-missing parent, finds it gone, and drops the companion
     (`src/pages/Timeline.tsx:907–915`, `resolveCompanion` in
     `src/lib/timelineMergeRules.ts:368–382`), so neither the spine id nor the diary id would
     open a visible entry. `useGrows().grows` holds active
     grows only (archived ones are partitioned out in `src/store/grows.tsx`) and
     `useScopedGrow` resolves `?growId=` against that list, so an archived-grow result could
     not open its Timeline.
   - "Own" means `user_id = auth.uid()` even for operators: RLS grants operators SELECT on
     every grower's diary entries (`20260517010926_65004f70-….sql:67–74`), so RLS alone is not
     owner scoping.

2. Each result shows a ~80-character note excerpt with the match, the plant or tent name
   when known, and the local date (`formatSnapshotTimestamp`). Under the chosen Option B the
   RPC returns the names from owner-scoped joins; Option A would need one batched
   owner-scoped lookup (generated `diary_entries` / `grow_events` relationship metadata has
   no plants/tents embed, so a relation select cannot supply them). When a name is unavailable the result shows "Plant" or "Tent",
   never a raw id. Selecting a result opens the Timeline for **that entry's grow**
   with the `timeline-entry-<id>` hash:
   - Before anchoring, the handoff clears every active Timeline filter that could hide the
     entry: plant, tent, type, search and date, plus the sensor-source filter
     (`src/pages/Timeline.tsx` `sensorSourceFilter`), the stage filter (`stageFilter`) and the
     event chip. Each of these filters can hide a diary row on its own.
   - A diary companion that `collapseQuickLogSaveFanOut` (`src/lib/timelineMergeRules.ts:312`,
     called at `src/pages/Timeline.tsx:1814`) folds into its spine anchors to the spine's id,
     the row that is actually rendered.
   - The existing hash handoff (`useTimelineHashAnchorHandoff.ts:50–63`) only scrolls to a row
     that is already mounted, and Timeline initially loads the selected grow's newest 100
     entries. The implementing slice adds a bounded "load until this entry or give up" step
     (for example one targeted read of the entry plus its page, capped) and a calm "This
     entry is no longer on the timeline" notice when it cannot be found.
3. A failed diary read is shown as "Diary results unavailable", never as "no results"
   (same rule the private RPC already follows).
4. No new data exposure: rows come only through RLS-scoped reads; no service role. RLS is
   the authorization boundary; the owner filter in requirement 1 only narrows an operator's
   personal search and must never be relied on as authorization.
5. Minimum query length 3 characters **for the diary read only**; grows, tents, plants and
   cultivars keep their current short-query behaviour (for example "OG"). Same debounce and
   private-state epoch as the existing hook, so cleared/sign-out state cannot leak results.
6. Diary search text never appears in a request URL. A note search term is private grower
   content; URLs reach access logs, proxies and observability tools that request bodies do
   not. The existing `verdant_search` RPC already sends `q` in a POST body.
7. Diary results keep their own newest-first order. `mergeGlobalSearchResults` sorts by
   rank, then score, then label (`src/lib/globalSearchResults.ts:158–162`), which would
   reorder equal-rank excerpts alphabetically (`"alpha…"` before `"zeta…"` even when zeta
   is newer). Diary rows are composed **after** that merge as their own group after the
   entity results and are never arguments to `mergeGlobalSearchResults`. Encoding recency
   in `rank` is an allowed alternative only if the implementing slice still asserts the
   same final composed list order.
   Appending diary rows must not push them past the dialog's first page.
   `GlobalSearchDialog` slices the composed list to its first `INITIAL_VISIBLE` rows
   (10, `filteredResults.slice(0, visibleCount)`), and the private and cultivar reads can
   return up to 20 rows each. A query matching ten or more entity or cultivar rows would
   therefore hide every diary match until "Show more" is pressed several times. The
   implementing slice reserves first-page slots per group (at least the first diary match
   when there is one), or applies the cutoff per group.
8. The result reaches the grower: the implementing slice adds a `'diary'` entity type to
   `GlobalSearchDialog` (group order, default and restored filter state, icon, heading,
   preview and route switch), so a diary row is not filtered out by `enabledTypes`. The
   dormant `GLOBAL_SEARCH_ITEMS` catalog stays out of scope; wiring page links into search is
   a separate change.
   The two persistence paths that list entity types by hand also change:
   - `sameFilters` in `src/lib/globalSearchSession.ts` compares the history entries' filters
     field by field. It must include `diary`, so two histories that differ only in the diary
     toggle stay distinct.
   - `readGlobalSearchLastSelected` checks `VALID_TYPES`. It must accept `diary`, so a
     persisted diary selection restores its preview instead of being dropped.

## Options

**Option A — client reads, no migration. Rejected: fails requirement 6.**
A new `src/lib/globalSearchDiaryRules.ts` (pure: literal-pattern escaping, excerpting,
ordering, label shaping, companion dedupe) and extra queries in `useGlobalSearch`: the same
owner-scoped literal `ilike` over `grow_events` (`is_deleted = false`, `deleted_at is null`,
ordered `occurred_at desc, id desc`) and over
`diary_entries.select("id,note,entry_at,plant_id,tent_id,grow_id")`
`.eq("user_id", <session user id>).ilike("note", "%" + escapeLike(q) + "%")`
`.is("retracted_at", null).order("entry_at", desc).order("id", desc).limit(10)`.
`escapeLike` escapes `\`, `%` and `_` (same as `escapePostgrestLikeLiteral` in
`src/hooks/usePlantAssignedTentActions.ts:130`). The `id` order is applied **before** the
limit, matching `orderNewestFirstStable` (`src/lib/timelineQueryOrderRules.ts:16`), so ties on
`entry_at` cannot select different rows on successive reads. The `user_id` filter uses the
authenticated session's id (never a value from the UI) and only narrows the operator case
above. That select returns plant and tent ids only. Generated relationship metadata has no
plants/tents embed (`diary_entries` → grows only; `grow_events` has none), so names cannot
come from this query. Fill them with at most two batched owner-scoped lookups of the result ids, one per table,
using session identity (the same `user_id` filter `useTimelineNameDirectory` uses, because
operator RLS can otherwise return every grower's names):
`.from("plants").select("id,name").in("id", plantIds).eq("user_id", <session user id>)` and the
same against `tents` with the tent ids. A `.from()` query reads one table, so the two run in
parallel, as `useTimelineNameDirectory` does.
Missing names show "Plant" or "Tent", never a raw id. Cost: the diary/spine reads plus at
most two batched name lookups; `%q%` scans are unindexed (acceptable at current
diary sizes; `NOT_MEASURED` at scale). **Privacy:** PostgREST reads are GET requests, so the
`ilike` filter, and with it the grower's search text, is in the request URL. Option A is
acceptable only if the owner explicitly accepts that.

**Option B — a separate diary search RPC (chosen).** A new function
`public.verdant_search_diary(q text, max_results int default 10)`, called with
`supabase.rpc(...)` (a POST body, requirement 6) **alongside** the unchanged `verdant_search`
call. Keeping it separate, rather than adding a branch to `verdant_search`:

- isolates failure, as requirement 3 needs: `verdant_search` is one SQL statement, so an error
  in a diary branch would abort the whole RPC and `useGlobalSearch` would drop every private
  result. With two calls, a failed diary RPC shows "Diary results unavailable" while grow,
  tent and plant results still render;
- leaves `verdant_search` byte-for-byte unchanged, including its `plants.strain` match and
  non-archived plant filter, and avoids changing its `RETURNS TABLE` contract, which
  `CREATE OR REPLACE` cannot do (it would need a drop and recreate);
- caps diary rows at 10 in its own `limit`, so they never compete for `verdant_search`'s
  `max_results`.

The function must:

- be `language sql`, `security invoker` (as `verdant_search` is), `stable`, with
  `set search_path = public, pg_temp`; after `create function`, run
  `revoke all … from public`, `revoke all … from anon` and
  `grant execute … to authenticated`, mirroring `verdant_search`
  (`20260723000807_…sql:83–85`), so it never keeps PostgreSQL's default PUBLIC execute;
- return `source` (`'grow_event'` or `'diary_entry'`), `id`, `note`, `occurred_at`
  (`grow_events.occurred_at` / `diary_entries.entry_at`, raw `timestamptz`), `grow_id`,
  `plant_id`, `tent_id`, `plant_name`, `tent_name`. The client formats `occurred_at` with
  `formatSnapshotTimestamp` in the browser's zone; names come from owner-scoped joins, so no
  second lookup is needed;
- match the raw `note` literally (`ilike '%' || escaped || '%' escape '\'`, escaping `\`,
  `%` and `_`), not through `verdant_normalize_search_text`: that normalizer replaces every
  non-alphanumeric run with a space (`20260723000807_…sql:12`), so `100%` or `a_b` could not
  match literally;
- search both tables and dedupe linked companions, applying `user_id = auth.uid()`, the
  deletion/retraction exclusions, the active-grow rule and newest-first `id`-tie-broken
  ordering, as in requirement 1, then
  `limit greatest(1, least(coalesce(max_results, 10), 10))`: a null or out-of-range
  `max_results` from the client still caps at 10, as `verdant_search` clamps its own
  (`20260723000807_…sql:78`). A plain `least(max_results, 10)` would be unlimited for null.

## Acceptance tests (for the implementing slice)

- Pure rules: excerpt centres the match and never exceeds the bound; ordering is newest-first
  with `id` tie-break; whitespace-only and <3-char queries return nothing; `100%`, `a_b` and
  `c:\x` are escaped so they match only literally (`100%` must not match `100 ml`).
- Query shape, Option B (chosen; RPC-side, against a local database): with more than 10
  matches sharing one timestamp, two calls return the same 10 ids, ordered by
  `occurred_at desc, id desc` before the limit; the search text is sent only in the RPC body; `verdant_search_diary` returns at most 10 rows
  with `grow_id` and `occurred_at`; `max_results` of `null` and `500` each return at most 10
  rows, and `0` and `-5` each return exactly 1 row, the newest matching fixture id; `100%` does not match `100 ml` server-side; `anon`
  cannot execute it.
- Partial failure: a failing `verdant_search_diary` shows "Diary results unavailable" while
  `verdant_search` results still render; a failing `verdant_search` does not hide diary
  results.
- Short queries: "OG" still returns cultivar and entity results and makes no diary read.
- Sources: a legacy spine-only Quick Log note is found; a note-only
  `quicklog_save_event` save from before the dual-timestamp foundation (spine-only) is found via
  the spine; a current note-only `quicklog_save_event` save (spine plus its mirror) is one
  result; a
  current `quicklog_save_manual` save (spine plus its unconditional mirror) that matches is
  one result; a legacy pair linked only by `details.grow_event_id`, and a legacy unlinked
  manual companion at the same plant and instant as its spine, are each one result carrying
  the spine id; an exact `'(quick log)'` placeholder does not match query `"quick"` or
  `"(quick log)"`, while a grower note `"topped in the quick log"` still matches `"quick"`;
  a deleted spine and a retracted entry are not returned, and neither is a non-retracted
  companion whose linked spine (`linked_grow_event_id` or legacy `grow_event_id`) is
  deleted. Option B: `verdant_search` is
  unchanged, so a plant found by its `strain` is still returned.
- Dialog (rendered `GlobalSearchDialog`): a diary result is visible with fresh filter state and
  with restored session filter state; selecting it navigates to
  `/timeline?growId=<the entry's grow>#timeline-entry-<id>` (the spine id for a collapsed
  companion), including for a grow other than the active one. With eleven or more entity and
  cultivar matches, the first diary match is still on the first page. A history entry that
  differs only in the diary toggle is kept as its own entry. A persisted diary last-selection
  restores its preview.
- Ordering: assert the **final composed list** (hook `results` after entity+diary
  composition, or the dialog's rendered groups), not only the diary helper's return
  value. Entity ids stay in `mergeGlobalSearchResults` order; diary ids then follow
  newest-first with `id` tie-break. Trap: equal-rank diary rows
  `id: "newer-zeta"` / `label: "zeta yellow leaves"` (newer) and
  `id: "older-alpha"` / `label: "alpha yellow leaves"` (older) still yield
  `[...entityIds, "newer-zeta", "older-alpha"]` after composition. Passing those two
  rows through `mergeGlobalSearchResults` today puts `"older-alpha"` first.
- Archived grows: a matching entry in an archived grow is not returned.
- Operator regression: a session with the operator role and diary rows from several owners
  returns only its own rows.
- Cross-owner negative: an ordinary user A searching for text that only user B's note
  contains gets no row.
- Option A only (rejected; kept for reference): the stubbed client query applies
  `.order("entry_at", desc).order("id", desc)` before `.limit(10)`.
- Hook (rendered with stubbed client): a matching entry appears with its local date; a failed
  diary read renders the unavailable notice while grow/plant results still show; clearing the
  private-state epoch drops diary results.
- Navigation (rendered Timeline): selecting a result older than the first loaded page loads it
  and scrolls to it; selecting a result from a different grow switches to that grow first; an
  active filter that hides the entry is cleared first, for each of plant, tent, type, search,
  date, sensor source, stage and event chip; a collapsed Quick Log companion scrolls
  to its visible row; an entry that cannot be found shows the calm notice instead of scrolling
  nowhere.
- Names: a result shows its plant or tent name, and "Plant" / "Tent" when the name read fails.
- RED-first proof for each test; no source-text scans as behaviour tests.

## Out of scope

Searching photos, sensor readings, AI Doctor sessions, Action Queue items; fuzzy/semantic
search; any schema change unless Option B is chosen.
