# Timeline — "All grows" view

Status: DRAFT spec. No implementation in this slice. Author: Claude, 2026-11-03.
Base: `verdant-grow-diary` at the branch point of `claude/grower-bugs-16`.
Trigger: grower bug brief 2026-11-03, item 16 ("The Timeline only shows one grow at a time, and
the grow switcher is a hidden native select. Add an 'All grows' view and a visible switcher.").
The visible switcher ships in the same PR as this spec; this document covers only "All grows".

## 1. What is true today (`established fact`, `src/pages/Timeline.tsx`)

- Every Timeline read is filtered to one grow, `activeGrowId` (URL `?growId=` wins over the
  stored active grow):
  - `diary_entries` `.eq("grow_id", …)` `.limit(100)`
  - `grow_events`, two reads, each `.limit(100)`
  - `action_queue_events` `.limit(50)` and `alert_events` `.limit(50)`
  - tents for the grow, then manual sensor readings capped at `TIMELINE_MANUAL_SENSOR_ROW_LIMIT`
  - signed photo URLs for the rows above
- The name directory (`useTimelineNameDirectory`), stage progression, grow-day label, action
  memory (`useActionResponseMemory({ growId })`), retracted Quick Logs and Quick Log lane scoping
  (`scopeTimelineQuickLogLaneRows`) all assume one grow.
- `source claim` (grower brief, item 10): one grow's per-plant Timeline already loads 100 of 255
  entries and can crash or hang the tab.

## 2. Why this is not a small change

- An all-grows read multiplies the rows on the page that item 10 reports as unstable. With N
  grows, the current caps give up to N × (100 + 100 + 100 + 50 + 50) rows plus sensor rows,
  unless the caps are re-cut to apply across grows.
- The per-grow header, stage progression and grow-day label have no meaning across grows.
- Each read needs `.in("grow_id", ownedGrowIds)` with RLS still the boundary. The id list must
  come from the owner's grow list (`useGrows`), never from the URL.

## 3. Recommendation

Do **item 10 first**: real pagination (cursor by `entry_at`, page size ≈ 50), list
virtualisation, and an audit for render loops. Then build "All grows" on that pager:

1. **Scope.** `?growId=all` is a new scope value. `resolveTimelineFetchScope` maps it to the list
   of the owner's active grow ids. An unknown value keeps today's fail-closed behaviour.
2. **Reads.** Each of the reads above becomes `.in("grow_id", ids)`, sharing one page cursor and
   one page-size budget across all grows, not one cap per grow.
3. **Rows.** Every card shows its grow name. The labels from PR #2820 (`Plant: … · Tent: …`) gain
   a `Grow: …` part, and the name directory is keyed by grow.
4. **Header.** In all-grows scope, hide the per-grow stage progression and day label. The page
   title reads "All grows".
5. **Switcher.** Add an "All grows" option at the top of `TimelineGrowSwitcher`.
6. **Writes.** Unchanged. Quick Log from an all-grows Timeline still needs an explicit target
   (remembered-target ban). Edit/remove act on the entry's own grow.

## 4. Acceptance tests (each proven RED first)

1. `?growId=all` reads every owned active grow and no other ids (assert the `.in` list).
2. One page cursor: two grows with 80 entries each give one page of 50, newest first across both.
3. Each card names its grow; two same-name plants in different grows can be told apart.
4. The stage progression is hidden in all-grows scope; per-grow pages are unchanged.
5. `?growId=<not mine>` and `?growId=` still fail closed / fall back as today.

## 5. Known unknowns

- `missing evidence` Real row counts per grow on the grower's account (item 10's 255 is one plant).
- `uncertainty` Whether action memory and retracted panels should appear in all-grows scope at
  all, or link out per grow.
