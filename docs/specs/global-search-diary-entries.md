# Spec — Global search over diary entries

Status: **proposed spec only** (filming bug #17, 2026-10-22). No code in this slice.
Owner decision needed before implementation: Option A vs Option B below.

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
   (`retracted_at IS NULL`). "Own" means `user_id = auth.uid()` even for operators: RLS
   grants operators SELECT on every grower's diary entries
   (`20260517010926_65004f70-….sql:67–74`), so RLS alone is not owner scoping.
2. Each result shows: a ~80-character note excerpt with the match, the plant or tent name
   when known, and the local date (`formatSnapshotTimestamp`). Selecting it opens the
   Timeline for **that entry's grow** with the `timeline-entry-<id>` hash. The existing hash
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
5. Minimum query length 3 characters, same debounce and private-state epoch as the existing
   hook, so cleared/sign-out state cannot leak results.

## Options

**Option A — client read, no migration (recommended first slice).**
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
diary sizes; `NOT_MEASURED` at scale).

**Option B — extend `verdant_search`.** Add a `'diary'` branch to the RPC so ranking stays
server-side and one round trip serves all private entities. Requires a new additive migration
(owner-gated: migrations/RLS are off-limits without Matthew's approval) and a trigram index for
scale.

## Acceptance tests (for the implementing slice)

- Pure rules: excerpt centres the match and never exceeds the bound; ordering is newest-first
  with `id` tie-break; whitespace-only and <3-char queries return nothing; `100%`, `a_b` and
  `c:\x` are escaped so they match only literally (`100%` must not match `100 ml`).
- Query shape (stubbed client): `.order("id", desc)` is applied before `.limit(10)`; with more
  than 10 matches sharing one `entry_at`, two reads return the same 10 ids.
- Operator regression: a session with the operator role and diary rows from several owners
  returns only its own rows.
- Hook (rendered with stubbed client): a matching entry appears with its local date; a failed
  diary read renders the unavailable notice while grow/plant results still show; clearing the
  private-state epoch drops diary results.
- Navigation (rendered Timeline): selecting a result older than the first loaded page loads it
  and scrolls to it; selecting a result from a different grow switches to that grow first; an
  entry that cannot be found shows the calm notice instead of scrolling nowhere.
- RED-first proof for each test; no source-text scans as behaviour tests.

## Out of scope

Searching photos, sensor readings, AI Doctor sessions, Action Queue items; fuzzy/semantic
search; any schema change unless Option B is chosen.
