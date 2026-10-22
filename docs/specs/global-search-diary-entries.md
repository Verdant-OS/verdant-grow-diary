# Spec — Global search over diary entries

Status: **proposed spec only** (filming bug #17, 2026-10-22). No code in this slice.
Owner decision needed before implementation: Option A vs Option B below. The privacy
requirement (6) now favours Option B, which needs a migration.

## Problem

A grower searching the app for something they logged ("yellow leaves", "topped",
"cal-mag") gets no diary results. Search covers grows, tents, plants and the bundled
cultivar references only.

## Current behaviour (established fact, deploy tip `7b30f121`)

| Piece            | Source                                                                                               | What it searches                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Private results  | `src/hooks/useGlobalSearch.ts:83` → RPC `verdant_search` (`supabase/migrations/20260723000807_…sql`) | `grows.name`, `tents.name`, `plants.name` for `auth.uid()` (lines 41–57) |
| Public results   | `searchCultivarReferences` (`src/lib/globalSearchResults.ts:63`)                                     | bundled cultivar constants                                               |
| Navigation items | `GLOBAL_SEARCH_ITEMS` (`src/lib/globalSearchItems.ts:22`)                                            | fixed page links; "diary" is only a keyword on the Quick Log item        |
| Merge            | `mergeGlobalSearchResults` (`src/lib/globalSearchResults.ts:143`)                                    | exact → prefix → fuzzy ordering is preserved                             |

`diary_entries` is never read by search.

## Requirements

1. Match the grower's **own** diary entries on `note` text (case-insensitive literal
   substring: `%`, `_` and `\` in the query match themselves), newest first with an `id`
   tie-break, bounded to **10** results and to entries the timeline would show
   (`retracted_at IS NULL`) in a grow the app can open: entries in archived grows are
   excluded, because `useGrows().grows` holds active grows only (archived ones are
   partitioned out in `src/store/grows.tsx`) and `useScopedGrow` resolves `?growId=` against
   that list, so an archived-grow result could not open its Timeline. "Own" means
   `user_id = auth.uid()` even for operators: RLS grants operators SELECT on every grower's
   diary entries (`20260517010926_65004f70-….sql:67–74`), so RLS alone is not owner scoping.
2. Each result shows: a ~80-character note excerpt with the match, the plant or tent name
   when known, and the local date (`formatSnapshotTimestamp`). Names come from the same
   owner-scoped read (a relation select on `plants(name)` / `tents(name)`, or one batched
   owner-scoped lookup of the result ids); when a name is unavailable the result shows
   "Plant" or "Tent" and never a raw id. Selecting it opens the
   Timeline for **that entry's grow** with the `timeline-entry-<id>` hash. Before anchoring,
   the implementing slice clears any active Timeline filter (plant, tent, type, search) that
   would hide the entry. When the entry is a Quick Log companion that
   `collapseQuickLogSaveFanOut` (`src/lib/timelineMergeRules.ts:312`, called at
   `src/pages/Timeline.tsx:1814`) folds into another row, the anchor targets the visible
   row that carries it. The existing hash
   handoff (`useTimelineHashAnchorHandoff.ts:50–63`) only scrolls to a row that is already
   mounted, and Timeline initially loads the selected grow's newest 100 entries, so the
   implementing slice must add a bounded "load until this entry or give up" step (for
   example one targeted read of the entry plus its page, capped) and a calm "This entry is
   no longer on the timeline" notice when it cannot be found.
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

## Options

**Option A — client read, no migration. Fails requirement 6.**
A new `src/lib/globalSearchDiaryRules.ts` (pure: literal-pattern escaping, excerpting,
ordering, label shaping) and a second query in `useGlobalSearch` that reads
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

**Option B — extend `verdant_search` (recommended).** Add a `'diary'` branch to the RPC so
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
- apply `user_id = auth.uid()`, `retracted_at is null`, the active-grow rule and
  `entry_at desc, id desc` ordering, as in requirement 1.

## Acceptance tests (for the implementing slice)

- Pure rules: excerpt centres the match and never exceeds the bound; ordering is newest-first
  with `id` tie-break; whitespace-only and <3-char queries return nothing; `100%`, `a_b` and
  `c:\x` are escaped so they match only literally (`100%` must not match `100 ml`).
- Query shape (stubbed client): `.order("id", desc)` is applied before `.limit(10)`; with more
  than 10 matches sharing one `entry_at`, two reads return the same 10 ids. Option B: the
  search text is sent only in the RPC body; the diary branch returns at most 10 rows and
  `grow_id`; `100%` does not match `100 ml` server-side.
- Short queries: "OG" still returns cultivar and entity results and makes no diary read.
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
