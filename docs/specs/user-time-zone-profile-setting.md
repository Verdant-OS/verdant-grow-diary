# Grower time zone — one profile setting for every displayed time

Status: DRAFT spec. No implementation in this slice. Author: Claude, 2026-11-03.
Base: `claude/new-session-azpsz3` at `47e0ec67a13e6fe5a42feff28509ef61abe1c2cc` (deploy branch
`verdant-grow-diary` merged in). Trigger: grower bug brief 2026-11-03, item 12 ("Older notes show
EDT/CDT and newer ones show CST. Render every time in the user's set time zone with a correct DST
label."). Founder decision, 2026-11-03: store the zone **on the profile** (not per device).

Labels follow AGENTS.md evidence discipline. Source facts are `established fact` at the base SHA.

## 1. What is true today

- `established fact` Every grower-facing time is formatted **at view time in the viewer's browser
  zone**. No zone is stored with any entry and no user zone setting exists:
  - `src/lib/growerTimeLabel.ts` `GrowerTimeLabel.formatAbsolute` / `zoneAbbreviation` pass a
    `timeZone` only when a caller supplies one; no production caller does.
  - `src/pages/Timeline.tsx:306` `TIMELINE_LOCAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - `src/lib/timelineDiaryEntryDetailPresentationRules.ts` takes an optional `timeZone`; Timeline
    passes the browser zone.
  - `src/components/QuickLogV2Sheet.tsx` (~L2057) resolves the Quick Log "reading time" against the
    browser zone (`QuickLogReadingTime.resolve(..., Intl.DateTimeFormat().resolvedOptions().timeZone)`).
  - `src/integrations/supabase/types.ts` `profiles.Row` has no zone column.
- `established fact` `Intl` picks the DST-correct abbreviation per instant. US DST ended
  2026-11-01, so in `America/Chicago` an October entry reads **CDT** and a Nov 2 entry **CST**: that
  part of the report is correct behavior.
- `inference` "EDT" can only appear when the page was viewed in a browser set to an Eastern zone
  (e.g. an automation browser), or when the note **text** itself contains "EDT". `missing evidence`:
  the affected rows were not inspected (no production data access).
- `established fact` Surfaces disagree on **whether** a zone is shown: the Timeline row and Recent
  Quick Logs (`src/lib/timelineEntryTimestampFormat.ts`, `includeZone: false`) show none; the
  snapshot strip (`src/lib/quickLogSnapshotStripAdapter.ts`), watering cadence
  (`src/lib/wateringCadenceHistoryRules.ts`) and grouped-timeline filter
  (`src/lib/quickLogGroupedTimelineFilterViewModel.ts`) show one; the diary PDF export prints
  `GrowerTimeLabel.zoneAbbreviation` (`src/lib/growDiaryPdfExport.ts:110`).

## 2. Goal and non-goals

Goal: a grower picks one IANA zone (e.g. `America/Chicago`) once. Every displayed time on every
device, and every time **entered** (Quick Log reading time), uses it, with a DST-correct label.

Non-goals: rewriting stored timestamps (they stay UTC `timestamptz`); changing note text; changing
CSV import parsing (`src/lib/csvParser.ts` keeps its own documented zone handling); the operator
SEO tooling that is pinned to `America/Chicago` on purpose
(`src/lib/seoLightingMeasurementReadinessRules.ts`).

## 3. Data — one additive migration (HELD: needs Matthew's per-PR approval)

```sql
-- supabase/migrations/<new timestamp>_profiles_time_zone.sql  (new file; never edit a merged one)
alter table public.profiles
  add column if not exists time_zone text null;

comment on column public.profiles.time_zone is
  'Grower-chosen IANA zone for displaying and entering times (e.g. America/Chicago). '
  'NULL = follow the browser. Validated against pg_timezone_names.';

-- Reject anything Postgres cannot resolve; NULL stays allowed.
create or replace function public.profiles_time_zone_is_valid(z text)
returns boolean language sql stable set search_path = '' as $$
  select z is null or exists (select 1 from pg_catalog.pg_timezone_names where name = z)
$$;
revoke execute on function public.profiles_time_zone_is_valid(text) from public, anon;

alter table public.profiles
  add constraint profiles_time_zone_valid
  check (public.profiles_time_zone_is_valid(time_zone)) not valid;
alter table public.profiles validate constraint profiles_time_zone_valid;
```

- `established fact` RLS already lets a grower update only their own row
  (`supabase/migrations/20260515204616_*.sql`: `"Users update own profile" ... USING (auth.uid() = user_id)`).
  No new policy, no grant, no anon access.
- `established fact` `public.profiles_block_gamification_updates()` blocks client writes to
  `nugs_total`, `level`, `tier` only (`20260606034030_*.sql` L117–131). `time_zone` is not one of
  them. **Re-verify the live trigger body** before apply; later migrations re-granted/revoked it.
- `uncertainty` A CHECK that calls a function is accepted by Postgres but is re-evaluated only on
  write; that is the intent here. If review prefers no function, use an app-side allowlist instead
  and drop the CHECK; either way the client validates first (§4).
- Old rows: `NULL` → behavior identical to today. Nothing is backfilled.
- Regenerate `src/integrations/supabase/types.ts` after apply (never hand-edit), and add the
  migration to the replay checks the CI already runs.

## 4. Pure rules — `src/lib/growerTimeZoneRules.ts`

```ts
export const GROWER_TIME_ZONE_COPY = {
  label: "Time zone",
  followBrowser: "Use this device's time zone",
  invalid: "That time zone isn't recognised. Pick one from the list.",
} as const;

/** Profile value if valid in this runtime, else the browser zone, else "UTC". */
export function resolveDisplayTimeZone(input: {
  profileTimeZone: string | null | undefined;
  browserTimeZone: string | null | undefined;
}): { zone: string; source: "profile" | "browser" | "fallback" };

/** True when Intl accepts the zone (try { new Intl.DateTimeFormat("en-US", { timeZone }) }). */
export function isSupportedTimeZone(zone: string): boolean;

/** Picker options: Intl.supportedValuesOf("timeZone") when present, else a fixed North America + UTC list; stable sort; current value always included. */
export function buildTimeZoneOptions(
  current: string | null,
  supported?: readonly string[],
): string[];
```

Rules: deterministic, no clock, no React, no Supabase. An invalid stored value never throws: it
falls back to the browser zone and the settings page shows the `invalid` copy.

## 5. Read path — one hook, every formatter

- `src/hooks/useGrowerTimeZone.ts`: reads `profiles.time_zone` for the signed-in user through
  React Query (key `["profile", userId, "time_zone"]`), returns
  `resolveDisplayTimeZone(...)`. Signed out or loading → browser zone (today's behavior; no flash
  of a different zone, because the fallback **is** today's zone).
- Thread `zone` into the formatters that already accept `timeZone`, and add the option where
  missing:
  1. `GrowerTimeLabel.formatAbsolute` / `zoneAbbreviation` — already accept it.
  2. `formatTimelineEntryTimestamp(iso, timeZone?)` — add the param; **also turn the zone label on**
     (`includeZone: true`) so Timeline rows say "CST"/"CDT" like the other surfaces. This changes
     pinned copy: renegotiate those pins in the same commit and name them in the PR.
  3. Timeline: replace `TIMELINE_LOCAL_TIME_ZONE` with the hook value (date-range bucketing and the
     detail presenter).
  4. `quickLogSnapshotStripAdapter`, `wateringCadenceHistoryRules`,
     `quickLogGroupedTimelineFilterViewModel`, `growDiaryPdfExport` (header stamp).
- Inventory step before coding: `rg "toLocale(String|DateString|TimeString)|Intl.DateTimeFormat" src --glob '!src/test/**'`
  and classify each hit as grower-facing time (thread the zone), UTC date bucket (leave), or
  operator/SEO (leave). The PR lists the classification.

## 6. Write path — entered times use the same zone

- Quick Log reading time: pass the hook's zone to `QuickLogReadingTime.resolve` instead of the
  browser zone. Payload stays UTC ISO; only interpretation of the typed wall-clock time changes.
- Show the zone next to the reading-time input ("Reading taken at · CST") so the grower sees which
  clock they are typing in.
- Do not change `quicklog_save_manual` or any RPC.

## 7. Settings UI — `src/pages/AccountPreferences.tsx`

- One "Time zone" select: first option `followBrowser` (stores `NULL`), then the options from
  `buildTimeZoneOptions`. Show the current local time and abbreviation under it as a preview.
- Save with `supabase.from("profiles").update({ time_zone }).eq("user_id", user.id).select("user_id")`
  and treat a zero-row result as failure (same guard as `PlantLifecycleWriteRules.rowWasWritten`).
  Toast on success; show the database error on failure. Invalidate the hook's query on success.
- Never accept a zone from the URL or any client input other than this control.

## 8. Acceptance tests (each proven RED before its fix)

1. `resolveDisplayTimeZone`: valid profile → profile; `NULL` → browser; invalid string → browser
   with `source: "browser"`; browser missing → `"UTC"`.
2. DST label: `2026-10-30T20:00:00Z` in `America/Chicago` → "CDT"; `2026-11-02T20:36:00Z` → "CST";
   same instants with profile `America/New_York` → "EDT" / "EST". Assert resolved strings, not source text.
3. Mixed devices: same rows rendered with profile `America/Chicago` and a test runtime zone of
   `America/New_York` show only CDT/CST.
4. Timeline row shows a zone label; old rows with no profile zone render exactly as before apart
   from that label.
5. Reading time typed as "3:36 PM" with profile `America/Chicago` on Nov 2 saves `2026-11-02T21:36:00Z`.
6. Settings: save success toasts; zero-row save shows an error and keeps the old value; a database
   error is shown verbatim.
7. Migration (runtime harness against local replay): grower A can set and clear their own
   `time_zone`; cannot update grower B's row; `'Mars/Olympus'` is rejected; gamification columns are
   still blocked.

## 9. Rollout and rollback

1. Migration PR (held for Matthew's exact-head approval, then his apply).
2. Code PR after the column exists in production; until then the hook's select must tolerate the
   missing column (`error` → browser zone), so merge order cannot break the app.
3. Rollback: revert the code PR; the nullable column can stay. Dropping it is a later, separate
   migration.

## 10. Known unknowns

- `missing evidence` Which production rows the grower saw with "EDT", and whether that text is in
  the note body. Inspect read-only on the fixture account before closing item 12.
- `uncertainty` Whether `Intl.supportedValuesOf` exists on every supported browser; §4 has a fallback list.
- `missing evidence` Live publisher and served SHA (AGENTS.md §11); this spec claims nothing about production.
