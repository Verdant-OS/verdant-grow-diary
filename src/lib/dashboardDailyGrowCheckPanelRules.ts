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

export interface DashboardDailyGrowCheckPanel {
  rows: DashboardDailyGrowCheckRow[];
  checked: number;
  total: number;
  summaryText: string;
  allChecked: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  emptyCtaHref: string;
  emptyCtaLabel: string;
  positiveConfirmation: string | null;
}

const EMPTY_MESSAGE =
  "No active plants in this grow yet. Add a plant to start tracking daily checks.";
const EMPTY_CTA_HREF = "/plants";
const EMPTY_CTA_LABEL = "Add a plant";
const POSITIVE_ALL =
  "Every active plant has a check logged today. Keep the rhythm going tomorrow.";

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
