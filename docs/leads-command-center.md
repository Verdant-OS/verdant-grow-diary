# Leads Command Center — Architecture

Read-only reference for the Leads page and its derived intelligence panels.
Everything described here is implemented today; this document does **not**
change runtime behavior.

## Page Purpose

`src/pages/Leads.tsx` is the operator console for inbound leads. It loads the
authenticated user's leads from the backend, exposes filter/search/sort/saved-view
controls, and renders a stack of read-only "command center" panels that turn the
current filtered lead set into actionable intelligence (status mix, pipeline
health, priority queue, data quality, source performance, executive summary).

The page itself owns no business logic — it is a thin orchestrator that:

1. Fetches leads (Supabase, RLS-scoped to `auth.uid()`).
2. Computes the **filtered** lead set via `leadSearchRules` and saved-view state.
3. Passes that filtered set into each derived rule helper.
4. Renders panels in a user-configurable but bounded order.
5. Opens a detail drawer when an operator selects a lead.

## Section Order

Default order is defined in `DEFAULT_SECTION_ORDER`
(`src/lib/leadCommandCenterLayoutRules.ts`):

1. `executive_summary`
2. `saved_views`
3. `guidance`
4. `status_summary`
5. `pipeline_health`
6. `priority_queue`
7. `data_quality`
8. `source_insights`
9. `analytics`

User reordering and visibility toggles persist to localStorage and are
sanitized on load — unknown ids are dropped, missing ids are appended, and a
corrupt payload falls back to defaults.

## Derived Rule Helper Map

Every panel is driven by a pure helper in `src/lib/`. No panel reads raw leads
out of band.

| Panel / Concern               | Helper                                  |
| ----------------------------- | --------------------------------------- |
| Executive Summary card        | `leadExecutiveSummaryRules`             |
| Saved Views menu              | `leadSavedViewsRules`                   |
| Command Center Guidance       | `leadCommandCenterGuidanceRules`        |
| Status Summary strip          | `leadStatusSummaryRules`                |
| Pipeline Health panel         | `leadPipelineHealthRules`               |
| Priority Queue panel          | `leadPriorityQueueRules`                |
| Data Quality Audit panel      | `leadDataQualityAuditRules`             |
| Source Insights panel         | `leadSourceInsightRules`                |
| Analytics panel               | `leadAnalyticsRules`                    |
| Search / filter / sort        | `leadSearchRules`                       |
| Section order + visibility    | `leadCommandCenterLayoutRules`          |
| Detail drawer snapshot        | `leadDetailSnapshotRules`               |
| Detail drawer view model      | `leadDetailViewModel`                   |
| Next action recommendation    | `leadNextActionRules`                   |
| Quality score badge           | `leadQualityScoreRules`                 |
| Activity timeline             | `leadActivityRules` + `leadEventRules`  |
| Follow-up scheduling          | `leadFollowupRules`                     |
| Shared field normalization    | `leadFieldUtils`                        |

`leadExecutiveSummaryRules` is a **composition** helper — it consumes the
outputs of `leadStatusSummaryRules`, `leadPipelineHealthRules`,
`leadPriorityQueueRules`, `leadDataQualityAuditRules`, and
`leadSourceInsightRules` rather than re-deriving from raw leads.

## localStorage Keys

| Key                                       | Owner                              | Stores                                                              |
| ----------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `verdant.leads.commandCenterLayout.v1`    | `leadCommandCenterLayoutRules.ts`  | Panel order + visibility ({ sections: [{ id, visible, order }] }). |
| `verdant.leads.savedViews.v1`             | `leadSavedViewsRules.ts`           | User-defined saved filter/search/sort views.                        |

Both keys are versioned (`.v1`), parsed defensively, and sanitized — unknown
ids and malformed payloads are dropped silently and replaced with defaults.

## Safety Rules

- All rule helpers are **pure** and deterministic — no I/O, no `Date.now()`
  inside ranking, no randomness, no Supabase calls.
- Helpers tolerate empty input, missing fields, unknown enums, and malformed
  timestamps without throwing.
- Unknown/missing status, source, or lead_type values surface as **warnings**
  or "review" states — they are never silently dropped from counts that drive
  data-quality decisions.
- Closed/lost leads are excluded from "needs action" metrics so completed work
  cannot inflate urgency.
- Divide-by-zero is guarded everywhere a rate is computed.
- Ordering is stable: helpers sort by score then by id so identical inputs
  always produce identical outputs.
- localStorage payloads are validated before use; corrupt JSON falls back to
  defaults rather than crashing the page.
- Field normalization (status / source / lead_type / timestamps) lives in one
  place — `leadFieldUtils` — so every panel agrees on what counts as
  "meaningful" data.

## No-Go Rules

The Leads Command Center is **read-only intelligence**. It must not:

- send SMS,
- send email,
- call webhooks or any outbound HTTP,
- export leads (CSV, PDF, zip, etc.),
- use the Supabase `service_role` key from the client,
- run background jobs or scheduled tasks,
- add new database tables, migrations, or persistence beyond the two
  versioned localStorage keys above,
- mutate lead rows from a derived panel (operator edits happen only inside
  the detail drawer's explicit forms).

Any future feature that would cross these lines belongs in a separate,
explicitly-scoped workstream — not in the command center.

## Filtered-Leads Scope

Every command-center panel receives the **same filtered lead array** that the
visible list shows. The flow is:

```
raw leads (RLS-scoped fetch)
   → leadSearchRules.applyLeadSearch(filters, search, sort, savedView)
   → filteredLeads
       → StatusSummary / PipelineHealth / PriorityQueue /
         DataQuality / SourceInsights / Analytics / ExecutiveSummary
```

Consequences:

- Changing a filter, search term, sort, or saved view re-derives every panel
  in one render pass — panels never disagree about scope.
- An empty filtered set yields empty/neutral panel states, never errors.
- Saved views only modify filter/search/sort state; they never mutate lead
  rows.

## Detail Drawer Intelligence

`LeadDetailDrawer.tsx` is a layout shell composed of presenter sub-components.
All intelligence is derived; the drawer reads only what helpers return.

Mounted order inside the drawer:

1. `LeadDetailHeader`
2. **Snapshot Card** — `LeadDetailSnapshotCard` ← `leadDetailSnapshotRules` /
   `leadDetailViewModel`
3. **Next Action** — `LeadNextActionPanel` ← `leadNextActionRules`, plus
   `LeadQualityScoreBadge` ← `leadQualityScoreRules`
4. **Derived Timeline** — `LeadActivityTimeline` ← `leadActivityRules` +
   `leadEventRules`
5. `LeadDetailContactSection` (status/type badges, summary, submission details)
6. `LeadDetailMetadataSection` (operator workflow: status, follow-up date,
   notes)
7. `LeadDetailIntelligenceSection` (interaction logging form + history)

The priority queue can hand the drawer any lead id from the filtered set
without requiring hidden fields — view-model helpers tolerate missing optional
data.

## Testing Strategy

- **Unit tests per rule helper** — one `src/test/leads-*.test.ts` file per
  module in `src/lib/`. Each helper is tested for: empty input, insufficient
  sample size, deterministic ordering, divide-by-zero safety, unknown/
  malformed field tolerance, and the specific business cases it encodes.
- **Component tests** for drawer presenter components and panels (string-level
  inspection via `_leadDrawerBundle` for the split drawer).
- **Contract test suite** — `src/test/leads-command-center-contract.test.ts`
  exercises the helpers together against shared fixtures to guarantee the
  invariants below hold across the whole command center.
- Tests avoid snapshots in favor of behavior assertions so refactors that
  preserve contracts don't churn fixtures.

## Contract Test Explanation

`leads-command-center-contract.test.ts` is a high-level behavioral suite
(separate from per-helper unit tests). It verifies that the **current
filtered leads** can safely feed every derived panel without coordination
bugs between helpers:

- Empty filtered sets produce neutral panel states, never throws.
- Unknown / malformed status, source, or lead_type values surface as warnings
  or "review" states instead of silently disappearing.
- Closed / lost leads never inflate "needs action" or urgency metrics.
- Priority queue ids always resolve to a drawer-openable lead with no hidden
  field requirement.
- Saved view application only mutates filter/search/sort state — lead rows
  passed downstream are unchanged.
- All helpers agree on the same filtered scope when fed the same input.
- Repeated calls with identical input return identical output (determinism).

These tests are intentionally about **contracts**, not snapshots, so internal
refactors that preserve behavior don't break them.

## Future Safe Extension Points

Additions that fit the existing architecture without violating no-go rules:

- **New derived panel**: add `src/lib/leadXxxRules.ts` (pure helper) + unit
  tests, add a presenter under `src/components/`, register an id in
  `DEFAULT_SECTION_ORDER`, and consume the same filtered lead array.
- **New executive summary signal**: extend `leadExecutiveSummaryRules` to
  consume an additional existing helper's output — never re-derive from raw
  leads.
- **New saved-view facet**: extend `leadSearchRules` filter schema and bump
  `verdant.leads.savedViews` to `.v2` with a migration in
  `leadSavedViewsRules`.
- **New drawer intelligence section**: add a pure helper + presenter,
  register it in the drawer between existing intelligence sections, keep raw
  field rendering in the contact/metadata sections.
- **Shared field semantics**: add to `leadFieldUtils` rather than introducing
  a parallel normalizer.
- **New layout preference**: extend the layout payload and bump the layout
  storage key version; keep sanitization defensive.

Out of scope by design (require a separate workstream, not a command-center
extension): outbound messaging, exports, scheduled jobs, server-side
aggregation, multi-user/team permissions, and anything requiring
`service_role`.
