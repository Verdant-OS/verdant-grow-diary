# Spec — Global search over diary entries

Status: **proposed spec only** (filming bug #17, 2026-10-22). No code in this slice.
**Owner decision (Matthew, 2026-10-22): Option B.** The implementing slice extends
`verdant_search` through a new additive migration, drafted on its own branch for the protected
migration review. No agent applies it; production apply stays with the owner. Option A is
recorded below only as the rejected alternative.

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
   `grow_events` (every confirmed Quick Log save writes this spine row) and `diary_entries`
   (a companion exists only when structured details exist; `src/hooks/useGrowDetailData.ts:11–15`).
   Searching `diary_entries` alone would leave plain Quick Logs undiscoverable, which is the
   filming bug itself. A diary companion linked to a matching spine
   (`details.linked_grow_event_id`) is one result, not two.
   - Matching is a case-insensitive literal substring: `%`, `_` and `\` in the query match
     themselves.
   - Order is newest first (`occurred_at` / `entry_at`) with an `id` tie-break, bounded to
     **10** results in total.
   - Excluded: `grow_events` rows with `is_deleted` or `deleted_at` set, `diary_entries` rows
     with `retracted_at` set, and entries in archived grows. `useGrows().grows` holds active
     grows only (archived ones are partitioned out in `src/store/grows.tsx`) and
     `useScopedGrow` resolves `?growId=` against that list, so an archived-grow result could
     not open its Timeline.
   - "Own" means `user_id = auth.uid()` even for operators: RLS grants operators SELECT on
     every grower's diary entries (`20260517010926_65004f70-….sql:67–74`), so RLS alone is not
     owner scoping.
2. Each result shows a ~80-character note excerpt with the match, the plant or tent name
   when known, and the local date (`formatSnapshotTimestamp`). Names come from the same
   owner-scoped read (a relation select on `plants(name)` / `tents(name)`, or one batched
   owner-scoped lookup of the result ids); when a name is unavailable the result shows
   "Plant" or "Tent", never a raw id. Selecting a result opens the Timeline for **that
   entry's grow** with the `timeline-entry-<id>` hash:
   - Before anchoring, the handoff clears any active Timeline filter (plant, tent, type,
     search, date) that would hide the entry.
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
   reorder them, so diary results render as their own group after the entity results (or
   carry a rank that encodes their recency order); they are not passed through that sort.
8. The result reaches the grower: the implementing slice adds a `'diary'` entity type to
   `GlobalSearchDialog` (group order, default and restored filter state, icon, heading,
   preview and route switch), so a diary row is not filtered out by `enabledTypes`. The
   dormant `GLOBAL_SEARCH_ITEMS` catalog stays out of scope; wiring page links into search is
   a separate change.

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
above. Cost: one extra request per search; `%q%` scans are unindexed (acceptable at current
diary sizes; `NOT_MEASURED` at scale). **Privacy:** PostgREST reads are GET requests, so the
`ilike` filter, and with it the grower's search text, is in the request URL. Option A is
acceptable only if the owner explicitly accepts that.

**Option B — extend `verdant_search` (chosen).** Add a `'diary'` branch to the RPC so
the search text stays in the POST body (requirement 6) and one round trip serves all private
entities. Requires a new additive migration (owner-gated: migrations/RLS are off-limits without
Matthew's approval) and a trigram index for scale. The branch must:

- return `grow_id` (and `plant_id` / `tent_id`) in the RPC's result contract, so a result can
  open its own grow's Timeline; the current return table has no such column;
- cap diary rows at 10 **inside the branch**, so diary matches can never crowd grows, tents
  and plants out of `max_results`;
- match the raw `note` literally (`ilike '%' || escaped || '%' escape '\'`, escaping `\`,
  `%` and `_`), not through `verdant_normalize_search_text`: that normalizer replaces every
  non-alphanumeric run with a space (`20260723000807_…sql:12`), so `100%` or `a_b` could not
  match literally;
- search both `grow_events` and `diary_entries` and dedupe linked companions, applying
  `user_id = auth.uid()`, the deletion/retraction exclusions, the active-grow rule and
  newest-first `id`-tie-broken ordering, as in requirement 1;
- keep every existing branch unchanged, including the `plants.strain` match and the
  non-archived plant filter; the implementing slice pins both in its regression tests.

## Acceptance tests (for the implementing slice)

- Pure rules: excerpt centres the match and never exceeds the bound; ordering is newest-first
  with `id` tie-break; whitespace-only and <3-char queries return nothing; `100%`, `a_b` and
  `c:\x` are escaped so they match only literally (`100%` must not match `100 ml`).
- Query shape (stubbed client): `.order("id", desc)` is applied before `.limit(10)`; with more
  than 10 matches sharing one `entry_at`, two reads return the same 10 ids. Option B: the
  search text is sent only in the RPC body; the diary branch returns at most 10 rows and
  `grow_id`; `100%` does not match `100 ml` server-side.
- Short queries: "OG" still returns cultivar and entity results and makes no diary read.
- Sources: a plain Quick Log note (spine row, no companion) is found; a spine with a linked
  diary companion that both match is one result; a deleted spine and a retracted entry are not
  returned. Option B: a plant found by its `strain` is still returned.
- Dialog (rendered `GlobalSearchDialog`): a diary result is visible with fresh filter state and
  with restored session filter state; selecting it navigates to
  `/timeline?growId=<the entry's grow>#timeline-entry-<id>` (the spine id for a collapsed
  companion), including for a grow other than the active one.
- Ordering: diary results render in newest-first order after merging with entity results.
- Archived grows: a matching entry in an archived grow is not returned.
- Operator regression: a session with the operator role and diary rows from several owners
  returns only its own rows.
- Hook (rendered with stubbed client): a matching entry appears with its local date; a failed
  diary read renders the unavailable notice while grow/plant results still show; clearing the
  private-state epoch drops diary results.
- Navigation (rendered Timeline): selecting a result older than the first loaded page loads it
  and scrolls to it; selecting a result from a different grow switches to that grow first; an
  active filter that hides the entry is cleared first; a collapsed Quick Log companion scrolls
  to its visible row; an entry that cannot be found shows the calm notice instead of scrolling
  nowhere.
- Names: a result shows its plant or tent name, and "Plant" / "Tent" when the name read fails.
- RED-first proof for each test; no source-text scans as behaviour tests.

## Out of scope

Searching photos, sensor readings, AI Doctor sessions, Action Queue items; fuzzy/semantic
search; any schema change unless Option B is chosen.
