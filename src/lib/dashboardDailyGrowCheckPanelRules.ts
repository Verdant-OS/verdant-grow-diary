/**
 * Pure rules for the Dashboard "Today's Grow Checks" panel.
 *
 * Read-only. No persistence. No writes. No RPC. No sensor ingestion.
 *
 * For each active plant in the current grow we derive whether the plant
 * has a Daily Grow Check today by reusing buildDailyGrowCheckConsistency
 * with windowDays=1 — same activity basis as Plant Detail.
 *
 * The guidance copy is derived via deriveDailyGrowCheckGuidance to avoid
 * duplicating language between Plant Detail and Dashboard.
 *
 * Disallowed user-copy wording is enforced by tests — see
 * src/test/dashboard-daily-grow-check-panel.test.tsx.
 */
import {
  buildDailyGrowCheckConsistency,
  formatTodayCheckMethodLabel,
  type ConsistencyInput,
  type TodayCheckMethod,
} from "@/lib/dailyGrowCheckConsistencyRules";
import {
  isActivePlant,
  type ArchivedPlantLike,
} from "@/lib/archivedPlantVisibilityRules";

export interface PanelPlantInput extends ArchivedPlantLike {
  id: string;
  name?: string | null;
  tentId?: string | null;
  tent_id?: string | null;
  growId?: string | null;
  grow_id?: string | null;
}

export interface PanelTentInput {
  id: string;
  name?: string | null;
}

export interface DashboardDailyGrowCheckPanelInput {
  now: Date;
  /** Currently scoped grow id, or null when viewing all grows. */
  scopedGrowId: string | null;
  plants: PanelPlantInput[];
  tents: PanelTentInput[];
  manualReadings: ConsistencyInput["manualReadings"];
  diaryEntries: ConsistencyInput["diaryEntries"];
}

export interface DashboardDailyGrowCheckRow {
  plantId: string;
  plantName: string;
  tentId: string | null;
  tentName: string | null;
  checkedToday: boolean;
  shortGuidance: string;
  /** Method that satisfied today's check ("none" when unchecked). */
  todayMethod: TodayCheckMethod;
  /** Short grower-friendly label like "Checked by note". Null when unchecked. */
  methodLabel: string | null;
  ctaHref: string;
  /** True when CTA should be rendered. False when already checked today. */
  showCta: boolean;
}

export type DashboardDailyGrowCheckEmptyVariant =
  | "none"
  | "no-plants-scoped"
  | "no-plants-all";

export interface DashboardDailyGrowCheckPanel {
  rows: DashboardDailyGrowCheckRow[];
  checked: number;
  total: number;
  summaryText: string;
  allChecked: boolean;
  isEmpty: boolean;
  emptyVariant: DashboardDailyGrowCheckEmptyVariant;
  emptyTitle: string;
  emptyMessage: string;
  emptyCtaHref: string;
  emptyCtaLabel: string;
  positiveConfirmation: string | null;
  /** Short first-run helper shown when plants exist but no checks today. */
  firstRunHint: string | null;
}

const EMPTY_TITLE_SCOPED = "No active plants in this grow yet";
const EMPTY_TITLE_ALL = "No active plants yet";
const EMPTY_MESSAGE_SCOPED =
  "Daily Grow Checks start after you add a plant. Add one to this grow to begin tracking notes and sensor snapshots day by day.";
const EMPTY_MESSAGE_ALL =
  "Daily Grow Checks appear here for the current grow. Add your first plant to start tracking notes and sensor snapshots day by day.";
const EMPTY_CTA_HREF = "/plants";
const EMPTY_CTA_LABEL = "Add a plant";
const POSITIVE_ALL =
  "Every active plant has a check logged today. Keep the rhythm going tomorrow.";
const FIRST_RUN_HINT =
  "Start with one plant note or sensor snapshot.";

function plantTentId(p: PanelPlantInput): string | null {
  return (p.tentId ?? p.tent_id ?? null) || null;
}

function plantGrowId(p: PanelPlantInput): string | null {
  return (p.growId ?? p.grow_id ?? null) || null;
}

function scopeToGrow(
  plants: PanelPlantInput[],
  scopedGrowId: string | null,
): PanelPlantInput[] {
  if (!scopedGrowId) return plants;
  return plants.filter((p) => {
    const g = plantGrowId(p);
    // Match the active grow OR legacy plants with no grow assignment so
    // the panel does not silently hide pre-grow_id plants.
    return g === scopedGrowId || g == null;
  });
}

export function buildDashboardDailyGrowCheckPanel(
  input: DashboardDailyGrowCheckPanelInput,
): DashboardDailyGrowCheckPanel {
  const scoped = scopeToGrow(input.plants, input.scopedGrowId);
  const active = scoped.filter(isActivePlant);

  if (active.length === 0) {
    return {
      rows: [],
      checked: 0,
      total: 0,
      summaryText: "No active plants to check",
      allChecked: false,
      isEmpty: true,
      emptyMessage: EMPTY_MESSAGE,
      emptyCtaHref: EMPTY_CTA_HREF,
      emptyCtaLabel: EMPTY_CTA_LABEL,
      positiveConfirmation: null,
    };
  }

  // Pre-bucket manual readings by tent so we only pass relevant rows in.
  const manualByTent = new Map<string, ConsistencyInput["manualReadings"]>();
  for (const r of input.manualReadings) {
    const tId = r.tent_id ?? null;
    if (!tId) continue;
    const arr = manualByTent.get(tId) ?? [];
    arr.push(r);
    manualByTent.set(tId, arr);
  }

  const tentName = new Map<string, string>();
  for (const t of input.tents) {
    if (t?.id && t.name) tentName.set(t.id, t.name);
  }

  // Pre-count plants per tent for the tent-level snapshot labeling logic.
  const plantsPerTent = new Map<string, number>();
  for (const p of active) {
    const t = plantTentId(p);
    if (!t) continue;
    plantsPerTent.set(t, (plantsPerTent.get(t) ?? 0) + 1);
  }

  // Stable sort: unchecked first (so growers see what needs attention),
  // then alphabetical by plant name for deterministic output.
  const rows: DashboardDailyGrowCheckRow[] = active
    .map((plant) => {
      const tId = plantTentId(plant);
      const summary = buildDailyGrowCheckConsistency({
        now: input.now,
        windowDays: 1,
        plantId: plant.id,
        currentTentId: tId,
        plantsInTentCount: tId ? plantsPerTent.get(tId) ?? 1 : 0,
        manualReadings: tId ? manualByTent.get(tId) ?? [] : [],
        diaryEntries: input.diaryEntries,
      });

      const checkedToday = summary.todayHasActivity;
      const methodLabel = formatTodayCheckMethodLabel(summary.todayMethod);

      const shortGuidance = checkedToday
        ? methodLabel ?? "Today's check is logged."
        : "No check logged for today yet.";

      const row: DashboardDailyGrowCheckRow = {
        plantId: plant.id,
        plantName: plant.name ?? "Unnamed plant",
        tentId: tId,
        tentName: tId ? tentName.get(tId) ?? null : null,
        checkedToday,
        shortGuidance,
        todayMethod: summary.todayMethod,
        methodLabel,
        ctaHref: `/daily-check?plantId=${plant.id}&from=dashboard`,
        showCta: !checkedToday,
      };
      return row;
    })
    .sort((a, b) => {
      if (a.checkedToday !== b.checkedToday) return a.checkedToday ? 1 : -1;
      return a.plantName.localeCompare(b.plantName);
    });

  const checked = rows.filter((r) => r.checkedToday).length;
  const total = rows.length;
  const allChecked = total > 0 && checked === total;

  return {
    rows,
    checked,
    total,
    summaryText: `Checked ${checked} of ${total} plant${total === 1 ? "" : "s"} today`,
    allChecked,
    isEmpty: false,
    emptyMessage: EMPTY_MESSAGE,
    emptyCtaHref: EMPTY_CTA_HREF,
    emptyCtaLabel: EMPTY_CTA_LABEL,
    positiveConfirmation: allChecked ? POSITIVE_ALL : null,
  };
}

/**
 * Filter values for the Dashboard "Today's Grow Checks" panel.
 * Read-only display filter — never affects the underlying summary calculation.
 */
export type DashboardDailyGrowCheckFilter =
  | "all"
  | "needs"
  | "note"
  | "sensor-snapshot"
  | "both";

export const DASHBOARD_DAILY_GROW_CHECK_FILTER_OPTIONS: ReadonlyArray<{
  value: DashboardDailyGrowCheckFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "needs", label: "Needs check" },
  { value: "note", label: "Checked by note" },
  { value: "sensor-snapshot", label: "Checked by sensor snapshot" },
  { value: "both", label: "Checked by both" },
];

export const DASHBOARD_DAILY_GROW_CHECK_FILTER_EMPTY =
  "No plants match this filter today.";

/**
 * Pure filter applied to already-sorted panel rows. Preserves order.
 * Never recomputes "checked" / "total" — those reflect the full grow.
 */
export function filterDashboardDailyGrowCheckRows(
  rows: DashboardDailyGrowCheckRow[],
  filter: DashboardDailyGrowCheckFilter,
): DashboardDailyGrowCheckRow[] {
  switch (filter) {
    case "needs":
      return rows.filter((r) => !r.checkedToday);
    case "note":
      return rows.filter((r) => r.checkedToday && r.todayMethod === "note");
    case "sensor-snapshot":
      return rows.filter(
        (r) => r.checkedToday && r.todayMethod === "sensor-snapshot",
      );
    case "both":
      return rows.filter((r) => r.checkedToday && r.todayMethod === "both");
    case "all":
    default:
      return rows;
  }
}

/**
 * Per-method counts for the "Today's Grow Checks" summary chips.
 *
 * Derived from the same row set the panel renders. Always reflects the full
 * grow — never affected by the active display filter.
 */
export interface DashboardDailyGrowCheckMethodCounts {
  needs: number;
  note: number;
  sensorSnapshot: number;
  both: number;
}

export interface DashboardDailyGrowCheckMethodChip {
  key: "needs" | "note" | "sensor-snapshot" | "both";
  /** Filter value to apply when the chip is clicked. */
  filterValue: DashboardDailyGrowCheckFilter;
  label: string;
  count: number;
}

export function buildDashboardDailyGrowCheckMethodCounts(
  rows: DashboardDailyGrowCheckRow[],
): DashboardDailyGrowCheckMethodCounts {
  let needs = 0;
  let note = 0;
  let sensorSnapshot = 0;
  let both = 0;
  for (const r of rows) {
    if (!r.checkedToday) {
      needs += 1;
      continue;
    }
    if (r.todayMethod === "note") note += 1;
    else if (r.todayMethod === "sensor-snapshot") sensorSnapshot += 1;
    else if (r.todayMethod === "both") both += 1;
  }
  return { needs, note, sensorSnapshot, both };
}

/**
 * Build the chip view-model. When there are no rows we return [] so callers
 * never render meaningless zero chips. Always returns all four chips
 * (including zero counts) when at least one active plant exists, so the
 * grid is stable and predictable.
 */
export function buildDashboardDailyGrowCheckMethodChips(
  rows: DashboardDailyGrowCheckRow[],
): DashboardDailyGrowCheckMethodChip[] {
  if (rows.length === 0) return [];
  const c = buildDashboardDailyGrowCheckMethodCounts(rows);
  return [
    { key: "needs", filterValue: "needs", label: "Needs check", count: c.needs },
    { key: "note", filterValue: "note", label: "Note", count: c.note },
    {
      key: "sensor-snapshot",
      filterValue: "sensor-snapshot",
      label: "Sensor",
      count: c.sensorSnapshot,
    },
    { key: "both", filterValue: "both", label: "Both", count: c.both },
  ];
}
