# Spec — Global search over diary entries

Status: **proposed spec only** (filming bug #17, 2026-10-22). No application or production code in this slice; it adds five spec-baseline Vitest files (14 tests).
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
   `grow_events` (every confirmed `quicklog_save_event` and `quicklog_save_manual` save writes
   this spine row) and `diary_entries`. Not every Quick Log save has a spine: the standalone
   Photo activity (`createQuickLogPhotoDiaryEntry`, called at
   `src/components/QuickLogAllActivitiesSection.tsx:1294`) and the video attachment helper
   (`src/lib/quickLogVideoDiaryEntry.ts:86`) insert only a `diary_entries` row. Such a row is
   matched on its own and returned as a `'diary_entry'` result; it never needs a spine.
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
   - linked by **one preferred link**: `details.linked_grow_event_id` when it is a non-empty
     JSON string, otherwise the legacy alias `details.grow_event_id`. This is the
     first-non-empty order of `pickLogicalGrowEventLink` (lines 168–179). Ownership, dedupe and
     the deleted-spine exclusion below all use that one link, never the other key. A present
     but unusable modern value (not a UUID, or no spine with the diary row's owner and
     `grow_id`) does not fall back to the legacy key, because Timeline picks the modern value
     without validating it. A row with **any** preferred link whose link does not resolve
     stays a standalone `'diary_entry'` result: it is never paired by the legacy tuple rule
     below, as `collapseQuickLogSaveFanOut` takes its link branch and continues without tuple
     fallback (`src/lib/timelineMergeRules.ts:393–407`). Only a row with no preferred link at
     all is "unlinked". The linked spine must have
     the diary row's owner **and** `grow_id`. Timeline only ever resolves a link inside the selected grow
     (`src/pages/Timeline.tsx:437–441`), and the dual-timestamp backfill joins on owner and
     grow (`20260725024026_quicklog_dual_timestamp_foundation.sql:205–209`); a stale or
     malformed link to the same owner's event in another grow must not replace or suppress
     this grow's result. Link values are historical JSON text, so they are compared as text:
     `ge.id::text = lower(btrim(<preferred link>))`, where the preferred link is
     `d.details->>'linked_grow_event_id'` when `jsonb_typeof` of that key is `string` and its
     text is non-empty, else the same test on `grow_event_id`. That comparison never throws and needs no extra privilege. A direct
     `::uuid` cast would let one malformed legacy row abort the whole RPC and show "Diary
     results unavailable", and `quicklog_try_parse_uuid` cannot be used: the same migration
     revokes its EXECUTE from `authenticated` (lines 132–134), so this `security invoker` RPC
     would fail with a permission error;
   - or, for an older unlinked manual companion, sharing the exact (grow, plant, tent,
     instant) key with a manual spine, plant and tent compared null-safely
     (`is not distinct from`). Timeline pairs on (plant, instant) (lines 405–407) only because it filters both
     sources to one `activeGrowId` first (`src/pages/Timeline.tsx:812,843`); this search spans
     every owned grow, so it must add `grow_id` or two grows' null-plant rows at one instant
     would collapse. It adds `tent_id` because `quicklog_save_manual` writes tent-level logs
     with a null plant and a caller-supplied time
     (`20260927160000_quicklog_manual_plant_tent_lineage.sql`), so two tents of one grow can
     share (grow, null plant, instant).
     - Environment siblings collapse first. A legacy manual save with sensor values wrote a
       watering/observation parent and a same-instant manual `environment` sibling with the same
       tuple (`20260611021144_…sql:300–343`). Before pairing, the search drops each environment
       sibling that shares its tuple with a non-environment manual spine, keeping the parent, as
       Timeline's `dedupeMergedManualGrowActivityRows`
       (`src/lib/connectedOneTentActivationRules.ts:567`, called by `collapseQuickLogSaveFanOut`)
       does. A standalone environment event with no such parent stays its own result.
     - One spine per tuple. If several surviving manual spines still share a tuple, the
       companion pairs only with the first in the result order (`occurred_at desc, id desc`,
       so the highest id), matching Timeline's first-input-wins pair key. The others stay
       their own results.

   When a spine and its companion collapse into one result, the returned `note` is the note
   that matched: the diary companion's when it matches, otherwise the spine's. Several
   non-retracted mirrors can resolve to one spine (the dual-timestamp backfill ranks such
   duplicates, `20260725024026_quicklog_dual_timestamp_foundation.sql:184–204`). Among the
   matching companions the note comes from the first by `entry_at desc, id desc`, so every
   call returns the same excerpt. Historical
   pairs can carry different notes, so projecting the spine's note alone could return an
   excerpt without the match.

   The result keeps the spine's id, the canonical id for one save, and is projected as the
   spine: `source` is `'grow_event'` and `occurred_at` is the spine's `occurred_at`, so the
   returned source owns the returned id and the result orders and dates by it. Only `note`
   may come from the companion. (Timeline's collapse feeds
   only the recent-activity lane; the main list still renders the diary card, so requirement 2
   says how the spine id is made addressable there.) The placeholder
   `'(quick log)'` is not grower-authored text: exclude it only when
   `isQuickLogPlaceholderNote` (`src/lib/plantFeedingDisplayRules.ts:54`) is true (exact,
   trimmed, case-insensitive). A grower note that merely contains those words still matches.
   Naive `ilike '%quick%'` would otherwise hit empty-note mirrors. The synthetic attachment
   notes are not grower-authored either: a diary row whose `details.event_type` is
   `quicklog_photo_attachment` or `photo` with the exact note `QUICK_LOG_PHOTO_DIARY_DEFAULT_NOTE`
   (`src/lib/quickLogPhotoDiaryEntry.ts:71`), or `quicklog_video_attachment` with
   `QUICK_LOG_VIDEO_DIARY_DEFAULT_NOTE` (`src/lib/quickLogVideoDiaryEntry.ts:50`), is
   excluded. A grower-written caption on an attachment still matches.
   - Matching is a case-insensitive literal substring: `%`, `_` and `\` in the query match
     themselves.
   - Order is newest first (`occurred_at` / `entry_at`) with an `id` tie-break, bounded to
     **10** results in total.
   - Excluded: `grow_events` rows with `is_deleted` or `deleted_at` set, `diary_entries` rows
     with `retracted_at` set, and entries in archived grows. Entries for an archived plant or
     tent in an active grow are kept: Timeline still lists that history under the plant's or
     tent's real name (`src/hooks/useTimelineNameDirectory.ts:9–23` loads names including
     archived rows), so the result is labelled with that same name and opens the same Timeline
     row. This differs from `verdant_search`, which drops archived plants as entity results;
     archiving a plant does not remove its diary. A non-retracted diary companion
     is excluded too when its preferred link resolves to a deleted spine owned by the diary
     row's owner and in the diary row's `grow_id`. A link to another grow is unresolved for
     this search and leaves the diary row standalone, even when that spine is deleted. This is a rule of this
     search, not a description of existing Timeline behaviour: the result's id would be the
     deleted spine's, and no visible Timeline row is addressable by it, so the result would
     open to nothing. `useGrows().grows` holds active
     grows only (archived ones are partitioned out in `src/store/grows.tsx`) and
     `useScopedGrow` resolves `?growId=` against that list, so an archived-grow result could
     not open its Timeline.
   - "Own" means `user_id = auth.uid()` even for operators: RLS grants operators SELECT on
     every grower's diary entries (`20260517010926_65004f70-….sql:67–74`), so RLS alone is not
     owner scoping.

2. Each result shows a note excerpt containing the whole match: 80 characters of note text by
   default, widened to the match's own length when the match is longer (so at most 120, the
   query cap), with an ellipsis (`…`, one character) on each clipped side. The ellipses sit
   **outside** that bound: the note text is at most 120 characters and the rendered excerpt at
   most 122. The excerpt also shows the plant or tent name
   when known, and the local date (`formatSnapshotTimestamp`). Under the chosen Option B the
   RPC returns the plant, tent **and grow** names from owner-scoped joins; Option A would need one batched
   owner-scoped lookup (generated `diary_entries` / `grow_events` relationship metadata has
   no plants/tents embed, so a relation select cannot supply them). When a name is unavailable the result shows "Plant" or "Tent",
   never a raw id. A row whose `plant_id` and `tent_id` are both null is a valid grow-level
   log, not a missing target: `quicklog_save_event` accepts that shape and the typed watering
   path emits it (`src/lib/writeQuickLogWateringTypedEvent.ts:256–269`). Such a row is
   labelled with its grow name (or "Grow" when that is unavailable), never "Plant" or "Tent". Selecting a result opens the Timeline for **that entry's grow**
   with the `timeline-entry-<id>` hash:
   - Before anchoring, the handoff clears every active Timeline filter that could hide the
     entry: plant, tent, type, search and date, plus the sensor-source filter
     (`src/pages/Timeline.tsx` `sensorSourceFilter`), the stage filter (`stageFilter`) and the
     event chip. Each of these filters can hide a diary row on its own.
   - The result's hash carries the spine id, but the main Timeline list does not render
     spines. `collapseQuickLogSaveFanOut` (`src/lib/timelineMergeRules.ts:312`, called at
     `src/pages/Timeline.tsx:1814`) builds only `recentLaneRawEntries`; the main list still
     renders each diary card under its diary id (`src/pages/Timeline.tsx:2801–2826`). A card
     gets a hidden spine-id alias only when its `details` carry an explicit
     `linked_grow_event_id` or `grow_event_id` (`buildLinkedGrowEventTimelineAnchorId`,
     `src/lib/timelineEntryAnchorRules.ts:23`). So a legacy **unlinked** manual companion,
     paired by (grow, plant, instant), has only its diary-id anchor, and a hash with the spine
     id scrolls nowhere. The implementing slice must give that card an alias for the spine id
     it was paired with, using the same pairing rule as the search.
     Exactly one card owns each spine alias, chosen without the query: when several mirrors
     resolve to one spine, the alias goes to the first by `entry_at desc, id desc`. Duplicate
     DOM ids would let `getElementById` pick the wrong card. The alias is what a reload or a
     shared link lands on.
   - The card that matched is carried separately. The RPC returns `matched_diary_entry_id`:
     the companion whose note supplied the excerpt (requirement 1), or null when the spine's
     own note did or there is no companion. The dialog passes it in router navigation state,
     never in the URL, so the private query never reaches the address bar. When that state
     names one of the target spine's rendered mirror cards, Timeline scrolls to that card's
     own `timeline-entry-<diary-id>` anchor instead of the spine alias. When it is absent
     (reload, shared link) or names no rendered mirror, Timeline uses the spine alias.
     The existing alias also keeps the link's spelling, and `getElementById` is case-sensitive,
     while the search returns the spine's canonical lowercase id. So every alias, explicit or
     paired, uses the resolved canonical spine id (lowercased, as the search compares it), not
     the raw `details` text.
   - The existing hash handoff (`useTimelineHashAnchorHandoff.ts:50–63`) only scrolls to a row
     that is already mounted, and Timeline initially loads the selected grow's newest 100
     entries. The implementing slice adds a bounded "load until this entry or give up" step
     (for example one targeted read of the entry plus its page, capped). "This entry is no
     longer on the timeline" is shown only when that read **succeeds** and returns no eligible
     row. A read that errors or times out has not established absence: it shows a separate,
     retryable "Couldn't load this entry" state instead.
   - Selecting the same result again from a Timeline already at that grow and hash must still
     scroll. The URL does not change, and `useTimelineHashAnchorHandoff` keeps the fragment in
     `handledAnchorRef` and skips it (`src/hooks/useTimelineHashAnchorHandoff.ts:57`). The
     selection flow re-arms an identical fragment (for example by clearing that ref on
     selection) before navigating.
   - A spine-only result has no diary card at all. Its `QuickLogHistoryPanels` row
     (`src/components/QuickLogHistoryPanels.tsx:250–255`) carries no DOM id, and that panel is
     capped, so loading more records cannot create the destination. The implementing slice
     must mount a row addressable by `timeline-entry-<spine-id>`: render the target spine as an
     anchored row, or give the panel row that id and include it past the cap.
   - Both cases are rendered navigation tests, not helper tests: each mounts Timeline with the
     hash and asserts the element with that id exists and is scrolled to.
3. A failed diary read is shown as "Diary results unavailable", never as "no results"
   (same rule the private RPC already follows).
4. No new data exposure: rows come only through RLS-scoped reads; no service role. RLS is
   the authorization boundary; the owner filter in requirement 1 only narrows an operator's
   personal search and must never be relied on as authorization.
5. Minimum query length 3 characters **for the diary read only**; grows, tents, plants and
   cultivars keep their current short-query behaviour (for example "OG"). The RPC enforces the
   minimum too: for a trimmed query shorter than 3 characters `verdant_search_diary` returns no
   rows before any pattern is built, so a direct caller cannot run a one- or two-character
   leading-wildcard scan. Exactly 3 characters is searched. Maximum 120
   characters, measured after the same trim as the minimum, enforced by `verdant_search_diary` itself (the same cap as
   `MAX_QUERY_LENGTH` in `src/lib/globalSearchSession.ts:21`, which today bounds only the
   persisted state). A longer query raises SQLSTATE `22023` with message
   `diary_query_too_long` before any pattern is built, so a direct authenticated caller cannot
   send an oversized pattern. The `ilike` pattern is built from the trimmed query, then
   escaped: surrounding spaces are never part of the pattern, so `"  yel  "` searches for
   `yel`. The hook already trims (`src/hooks/useGlobalSearch.ts:57`); this binds the RPC
   for direct callers. The cap bounds the pattern, not the work: a leading-wildcard
   `ilike` still reads every eligible row the owner has, and `limit 10` does not bound that,
   so scan cost at scale is `NOT_MEASURED`. An empty result set cannot carry a status,
   so the error is the channel: the hook maps exactly that code and message to an
   invalid-query state ("Diary search is limited to 120 characters") and every other error to
   "Diary results unavailable". The dialog input also gets `maxLength={120}`, so the UI never sends one. Same debounce and
   private-state epoch as the existing hook, so cleared/sign-out state cannot leak results.
   The hook calls `verdant_search_diary` only for a signed-in session: the public
   `/cultivars` page mounts `GlobalSearchDialog` (`src/pages/CultivarsIndex.tsx:340`) and the
   RPC is revoked from `anon`, so a signed-out search makes no diary request and shows no diary
   state at all, neither results nor "Diary results unavailable".
6. Diary search text never appears in a request URL. A note search term is private grower
   content, and URLs land in access logs and proxy logs by default. A POST body removes that
   default URL exposure, as the existing `verdant_search` RPC already does with `q`, but it
   does not hide the term from tools that capture bodies (request tracing, debug logging).
   So the client and the RPC never log the diary query or the request body, and neither is
   added to analytics, telemetry or error reports.
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
   - `normalizeFilters` in `src/lib/globalSearchSession.ts:41–51` copies a hard-coded
     grow/tent/plant/cultivar key list. It must include `diary`, or a saved `diary: false` is
     dropped and diary results silently come back on reopen or history replay. Its all-off
     guard counts the diary toggle too.
   - `sameFilters` in `src/lib/globalSearchSession.ts` compares the history entries' filters
     field by field. It must include `diary`, so two histories that differ only in the diary
     toggle stay distinct.
   - `readGlobalSearchLastSelected` checks `VALID_TYPES`. It must accept `diary`, so a
     persisted diary selection restores its preview instead of being dropped.
   - The preview follows the excerpt. Diary labels depend on the query, but
     `resultsContentKey` keys rows by entity type and id only
     (`src/components/GlobalSearchDialog.tsx:119–122`), and preview sync keeps the previous
     row whenever that id is still visible (lines 269–275). Changing from one matching term
     to another in the same note would leave the preview on the old excerpt. The key
     includes a diary row's displayed label, and the sync replaces the previewed row with the
     visible row of the same id when its content differs, without reintroducing the render
     loop the key prevents.

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

- be `language plpgsql` (a `language sql` body cannot `raise` the required `22023` /
  `diary_query_too_long` error), with the length guard before `return query`, and
  `security invoker` (as `verdant_search` is), `stable`, with
  `set search_path = public, pg_temp`; after `create function`, run
  `revoke all … from public`, `revoke all … from anon` and
  `grant execute … to authenticated`, mirroring `verdant_search`
  (`20260723000807_…sql:83–85`), so it never keeps PostgreSQL's default PUBLIC execute;
- return `source` (`'grow_event'` or `'diary_entry'`), `id`, `matched_diary_entry_id`
  (requirement 2; null when the spine's own note supplied the excerpt), `note`, `occurred_at`
  (`grow_events.occurred_at` / `diary_entries.entry_at`, raw `timestamptz`), `grow_id`,
  `plant_id`, `tent_id`, `grow_name`, `plant_name`, `tent_name`. The client formats `occurred_at` with
  `formatSnapshotTimestamp` in the browser's zone; names come from owner-scoped joins, so no
  second lookup is needed;
- match the raw `note` literally (`ilike '%' || escaped || '%' escape '\'`, escaping `\`,
  `%` and `_`), not through `verdant_normalize_search_text`: that normalizer replaces every
  non-alphanumeric run with a space (`20260723000807_…sql:12`), so `100%` or `a_b` could not
  match literally;
- search both tables and dedupe linked companions, applying `user_id = auth.uid()`, the
  deletion/retraction exclusions, the active-grow rule and newest-first `id`-tie-broken
  ordering, as in requirement 1. No candidate query on either table is windowed, paged or
  limited before link and `(owner, grow_id, plant_id, tent_id, instant)` resolution finishes:
  a spine joins its companion whether or not the spine's own note matches or falls among the
  newest rows, as `findMissingLinkedGrowEventIds` and `collapseQuickLogSaveFanOut` require
  (`src/lib/timelineMergeRules.ts:271–277`). Only then
  `limit greatest(1, least(coalesce(max_results, 10), 10))`: a null or out-of-range
  `max_results` from the client still caps at 10, as `verdant_search` clamps its own
  (`20260723000807_…sql:78`). Postgres `least` ignores nulls, so `least(NULL, 10)` is already
  10; the `coalesce` only makes that explicit. The `greatest(1, …)` is what matters: it gives
  the lower bound, so a zero or negative `max_results` still returns at least one row instead
  of an empty or failing `limit`.

## Acceptance tests (for the implementing slice)

- Pure rules: excerpt centres the match and its note text never exceeds the bound; a
  120-character match with text on both sides is shown whole as 120 characters of note text
  plus one ellipsis on each side (122 rendered); ordering is newest-first
  with `id` tie-break; whitespace-only and <3-char queries return nothing, and an exactly 3-character query is
  searched; `100%`, `a_b` and
  `c:\x` are escaped so they match only literally (`100%` must not match `100 ml`).
- Query shape, Option B (chosen; RPC-side, against a local database): with more than 10
  matches sharing one timestamp, two calls return the same 10 ids, ordered by
  `occurred_at desc, id desc` before the limit; the search text is sent only in the RPC body; `verdant_search_diary` returns at most 10 rows
  with `grow_id` and `occurred_at`; `max_results` of `null` and `500` each return at most 10
  rows, and `0` and `-5` each return exactly 1 row, the newest matching fixture id; `100%` does not match `100 ml` server-side; `anon`
  cannot execute it; a 1- and a 2-character query (after trim) return no rows and a
  3-character query returns its match; a 120-character query runs, the same query padded with surrounding spaces runs and returns
  exactly the ids the unpadded query returns (and `"  yel  "` returns the same ids as
  `"yel"`), and a
  121-character query (after trim) raises
  `22023` / `diary_query_too_long`, which the hook shows as the invalid-query state, not as
  "Diary results unavailable"; run **as `authenticated`**, a legacy row with a valid link
  pairs with its spine and one whose link value is not a UUID does not fail the call and is
  returned standalone, never tuple-paired; a row whose `linked_grow_event_id` and `grow_event_id` name two
  different owned same-grow spines pairs only with the `linked_grow_event_id` spine (the
  other spine stays its own result), and a row with a non-UUID `linked_grow_event_id` and a
  valid `grow_event_id` is returned standalone, not paired through the legacy key or the
  tuple rule.
- Pairing edges (local database): a legacy sensor-carrying manual save (watering parent,
  same-instant `environment` sibling, unlinked diary companion; all at one tuple) returns one
  result with the parent's id, never the sibling's; a standalone environment event still
  matches on its own; two non-environment manual spines at one tuple pair the companion
  only with the higher id; a row whose preferred link is malformed or names another grow,
  and which shares its tuple with an unrelated manual spine, stays its own `'diary_entry'`
  result; two matching mirrors of one spine return one row whose note is the first by
  `entry_at desc, id desc`, on repeated calls; a standalone Photo-activity diary row with a
  grower caption is found as a `'diary_entry'` result.
- Collapsed projection: a linked pair whose companion note matches, whose spine note does
  not, and whose `entry_at` differs from the spine's `occurred_at` returns one row with
  `source = 'grow_event'`, the spine's id and `occurred_at`, and the companion's note.
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
  the spine id; two grows each holding a null-plant unlinked companion and spine at the same
  instant return two results, each with its own grow's spine id; a diary row in grow A
  whose explicit link points at the same owner's event in grow B stays its own grow A
  result, and B's deleted event does not suppress it; two tent-level unlinked companions in
  different tents of one grow, each at the same instant as its own tent's spine, return two
  results with their own spine ids; a pair whose diary note matches and whose spine note does
  not returns an excerpt containing the match; a note-less photo or video attachment does
  not match `"photo"` or `"video"`, while a grower caption on one still matches; a grow-level row (null plant and
  tent) is labelled with its grow name, not "Plant" or "Tent"; an exact `'(quick log)'` placeholder does not match query `"quick"` or
  `"(quick log)"`, while a grower note `"topped in the quick log"` still matches `"quick"`;
  a deleted spine and a retracted entry are not returned, and neither is a non-retracted
  companion whose linked spine (`linked_grow_event_id` or legacy `grow_event_id`), in the
  same owner and grow, is deleted; the newest matching companion, whose spine's own note does not match the query, still
  returns one result carrying its spine id while more than ten older matching spines exist
  in the same grow (resolution does not depend on the spine being a matching or windowed
  candidate; the result is newest, so the final 10-row limit keeps it). Option B: `verdant_search` is
  unchanged, so a plant found by its `strain` is still returned.
- Dialog (rendered `GlobalSearchDialog`): a diary result is visible with fresh filter state and
  with restored session filter state; selecting it navigates to
  `/timeline?growId=<the entry's grow>#timeline-entry-<id>` (the spine id for a collapsed
  companion), including for a grow other than the active one. Rendered Timeline navigation
  tests cover five hash targets by spine id, each asserting a mounted element with that id
  is scrolled to: an explicitly linked companion (existing alias), two mirrors of one spine (only the
  first by `entry_at desc, id desc` carries the alias), a legacy unlinked manual
  companion paired by (grow, plant, tent, instant) (new alias), a companion whose explicit
  link is written in uppercase (alias uses the canonical lowercase id), and a spine-only result
  (new anchored row). A further rendered test selects, in succession, two results whose
  `matched_diary_entry_id` names different mirrors of one spine, and asserts each selection
  scrolls to its own mirror card, and that a reload of the same URL without navigation state
  lands on the alias owner. The spine-only fixture is older than both the initial grow-event page
  and the history-panel cap, so a capped panel cannot pass it. With exactly ten entity and
  cultivar matches (the `INITIAL_VISIBLE` boundary), the first diary match is among the
  first ten rendered rows. A history entry that
  differs only in the diary toggle is kept as its own entry. A restored session or history
  filter object saved before this change, holding only the four pre-diary fields, normalizes
  the missing diary toggle to enabled, and the diary result is visible with it. A session
  saved with the diary toggle off restores with it still off (round trip through
  `normalizeFilters`). A persisted diary last-selection
  restores its preview. Changing the query to another term in the same note updates the
  preview to the new excerpt, and the input accepts at most 120 characters.
- Ordering: assert the **final composed list** (hook `results` after entity+diary
  composition, or the dialog's rendered groups), not only the diary helper's return
  value. Entity ids stay in `mergeGlobalSearchResults` order; diary ids then follow
  newest-first with `id` tie-break. Trap: equal-rank diary rows
  `id: "newer-zeta"` / `label: "zeta yellow leaves"` (newer) and
  `id: "older-alpha"` / `label: "alpha yellow leaves"` (older) still yield
  `[...entityIds, "newer-zeta", "older-alpha"]` after composition. Passing those two
  rows through `mergeGlobalSearchResults` today puts `"older-alpha"` first.
- Archived grows: a matching entry in an archived grow is not returned.
- Archived plant or tent: a matching entry for an archived plant in an active grow is
  returned, labelled with that plant's name, and opens its Timeline row.
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
  to its visible row; an entry whose targeted read succeeds with no eligible row shows the
  "no longer on the timeline" notice instead of scrolling nowhere, and a targeted read that
  errors or times out shows the retryable "Couldn't load this entry" state, never that
  notice.
- Names: a result shows its plant or tent name, and "Plant" / "Tent" when the name read fails;
  a grow-level result (null plant and tent) shows its grow name, and "Grow" when the grow
  name is unavailable.
- Re-selection: selecting the same diary result twice from a Timeline already at its hash
  scrolls both times.
- Privacy: with a spy on `console` and the analytics sink, a diary search logs neither the
  query nor the request body.
- Signed out (the public `/cultivars` palette): a 3+ character search makes no
  `verdant_search_diary` call and shows no diary unavailable notice, while cultivar results
  still render.
- RED-first proof for each test; no source-text scans as behaviour tests.

## Out of scope

Searching photos, sensor readings, AI Doctor sessions, Action Queue items; fuzzy/semantic
search; any schema change beyond the one additive `verdant_search_diary` migration (Option
B).
