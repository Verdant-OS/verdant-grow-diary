/**
 * Pure rules for attaching a manual Pheno evidence receipt to the existing
 * Quick Log diary entry. The receipt records provenance and coverage only.
 * It never scores, ranks, selects, queues, or controls anything.
 */
import { PHENO_EVIDENCE_GOALS, type PhenoEvidenceGoalId } from "@/lib/phenoEvidenceGoals";

export const PHENO_EVIDENCE_RECEIPT_KIND = "pheno_evidence_receipt" as const;
export const PHENO_EVIDENCE_RECEIPT_VERSION = 1 as const;

const GOAL_IDS = new Set<string>(PHENO_EVIDENCE_GOALS.map((goal) => goal.id));

export interface PhenoEvidenceReceiptDetails {
  readonly kind: typeof PHENO_EVIDENCE_RECEIPT_KIND;
  readonly receipt_version: typeof PHENO_EVIDENCE_RECEIPT_VERSION;
  readonly source: "manual";
  readonly evidence_only: true;
  readonly hunt_id: string;
  readonly plant_id: string;
  readonly evidence_goal: PhenoEvidenceGoalId;
  readonly stage: string | null;
  readonly automatic_selection: false;
  readonly action_queue_created: false;
  readonly device_control: false;
}

export interface BuildPhenoEvidenceReceiptInput {
  huntId: unknown;
  plantId: unknown;
  evidenceGoal: unknown;
  /** Pass a canonical stage or null. Unknown stages fail closed to null. */
  stage?: unknown;
}

export interface RawPhenoEvidenceDiaryRow {
  id: string;
  plant_id: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
  entry_at: string;
  photo_url?: string | null;
  details: unknown;
}

export type PhenoEvidenceFreshness = "fresh" | "stale" | "invalid" | "unknown";

export interface ParsedPhenoEvidenceReceipt {
  readonly diaryEntryId: string;
  readonly entryAt: string;
  readonly huntId: string;
  readonly plantId: string;
  readonly evidenceGoal: PhenoEvidenceGoalId;
  readonly stage: string | null;
  readonly hasPhoto: boolean;
  readonly sensorContext: {
    readonly attached: true;
    readonly freshness: PhenoEvidenceFreshness;
    readonly capturedAt: string | null;
  } | null;
}

export interface PhenoEvidenceCoverageItem {
  readonly id: PhenoEvidenceGoalId;
  readonly label: string;
  readonly description: string;
  readonly recorded: boolean;
  readonly receiptCount: number;
  readonly latestEntryAt: string | null;
}

export interface PhenoEvidenceCoverage {
  readonly goals: ReadonlyArray<PhenoEvidenceCoverageItem>;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly receipts: ReadonlyArray<ParsedPhenoEvidenceReceipt>;
}

function boundedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

function asGoalId(value: unknown): PhenoEvidenceGoalId | null {
  return typeof value === "string" && GOAL_IDS.has(value) ? (value as PhenoEvidenceGoalId) : null;
}

function canonicalStage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return ["seedling", "veg", "flower", "flush", "harvest", "drying"].includes(trimmed)
    ? trimmed
    : null;
}

function normalizedIso(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Build the bounded JSON object persisted as diary_entries.details. */
export function buildPhenoEvidenceReceiptDetails(
  input: BuildPhenoEvidenceReceiptInput,
): PhenoEvidenceReceiptDetails | null {
  const huntId = boundedId(input.huntId);
  const plantId = boundedId(input.plantId);
  const evidenceGoal = asGoalId(input.evidenceGoal);
  if (!huntId || !plantId || !evidenceGoal) return null;

  return {
    kind: PHENO_EVIDENCE_RECEIPT_KIND,
    receipt_version: PHENO_EVIDENCE_RECEIPT_VERSION,
    source: "manual",
    evidence_only: true,
    hunt_id: huntId,
    plant_id: plantId,
    evidence_goal: evidenceGoal,
    stage: canonicalStage(input.stage),
    automatic_selection: false,
    action_queue_created: false,
    device_control: false,
  };
}

/**
 * Preserve the hunt's configured order while removing unknown and duplicate
 * values. Empty/invalid input stays empty; defaults are never invented.
 */
export function sanitizeConfiguredPhenoEvidenceGoals(input: unknown): PhenoEvidenceGoalId[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<PhenoEvidenceGoalId>();
  const goals: PhenoEvidenceGoalId[] = [];
  for (const value of input) {
    const goal = asGoalId(value);
    if (!goal || seen.has(goal)) continue;
    seen.add(goal);
    goals.push(goal);
  }
  return goals;
}

function parseSensorContext(details: Record<string, unknown>) {
  const sensor = objectRecord(details.sensor);
  if (!sensor) return null;
  const freshness: PhenoEvidenceFreshness =
    sensor.freshness === "fresh" ||
    sensor.freshness === "stale" ||
    sensor.freshness === "invalid" ||
    sensor.freshness === "unknown"
      ? sensor.freshness
      : "unknown";
  return {
    attached: true as const,
    freshness,
    capturedAt: normalizedIso(sensor.captured_at),
  };
}

/** Parse only a receipt that still matches the expected hunt and candidate. */
export function parsePhenoEvidenceReceiptRow(
  row: RawPhenoEvidenceDiaryRow,
  expected: { huntId: string; plantId: string },
): ParsedPhenoEvidenceReceipt | null {
  if (!row || boundedId(row.id) === null) return null;
  const entryAt = normalizedIso(row.entry_at);
  if (!entryAt) return null;
  const details = objectRecord(row.details);
  if (!details) return null;
  if (details.kind !== PHENO_EVIDENCE_RECEIPT_KIND) return null;
  if (details.receipt_version !== PHENO_EVIDENCE_RECEIPT_VERSION) return null;
  if (details.source !== "manual" || details.evidence_only !== true) return null;
  if (
    details.automatic_selection !== false ||
    details.action_queue_created !== false ||
    details.device_control !== false
  ) {
    return null;
  }

  const huntId = boundedId(details.hunt_id);
  const plantId = boundedId(details.plant_id);
  const evidenceGoal = asGoalId(details.evidence_goal);
  if (!huntId || !plantId || !evidenceGoal) return null;
  if (huntId !== expected.huntId || plantId !== expected.plantId) return null;
  if (row.plant_id !== expected.plantId) return null;

  return {
    diaryEntryId: row.id,
    entryAt,
    huntId,
    plantId,
    evidenceGoal,
    stage: canonicalStage(details.stage),
    hasPhoto: typeof row.photo_url === "string" && row.photo_url.trim().length > 0,
    sensorContext: parseSensorContext(details),
  };
}

/**
 * Coverage is strictly a record/missing summary. It does not assign quality,
 * scores, readiness, rank, or a keeper decision.
 */
export function buildPhenoEvidenceCoverage(input: {
  configuredGoals: unknown;
  diaryRows: ReadonlyArray<RawPhenoEvidenceDiaryRow> | null | undefined;
  huntId: string;
  plantId: string;
}): PhenoEvidenceCoverage {
  const configuredGoals = sanitizeConfiguredPhenoEvidenceGoals(input.configuredGoals);
  const allowed = new Set(configuredGoals);
  const receipts = (input.diaryRows ?? [])
    .map((row) =>
      parsePhenoEvidenceReceiptRow(row, {
        huntId: input.huntId,
        plantId: input.plantId,
      }),
    )
    .filter((receipt): receipt is ParsedPhenoEvidenceReceipt => {
      return receipt !== null && allowed.has(receipt.evidenceGoal);
    })
    .sort((a, b) => {
      const byTime = Date.parse(b.entryAt) - Date.parse(a.entryAt);
      return byTime !== 0 ? byTime : a.diaryEntryId.localeCompare(b.diaryEntryId);
    });

  const counts = new Map<PhenoEvidenceGoalId, number>();
  const latest = new Map<PhenoEvidenceGoalId, string>();
  for (const receipt of receipts) {
    counts.set(receipt.evidenceGoal, (counts.get(receipt.evidenceGoal) ?? 0) + 1);
    if (!latest.has(receipt.evidenceGoal)) latest.set(receipt.evidenceGoal, receipt.entryAt);
  }

  const catalog = new Map(PHENO_EVIDENCE_GOALS.map((goal) => [goal.id, goal]));
  const goals = configuredGoals.map((id) => {
    const goal = catalog.get(id)!;
    const receiptCount = counts.get(id) ?? 0;
    return {
      id,
      label: goal.label,
      description: goal.description,
      recorded: receiptCount > 0,
      receiptCount,
      latestEntryAt: latest.get(id) ?? null,
    };
  });

  return {
    goals,
    completedCount: goals.filter((goal) => goal.recorded).length,
    totalCount: goals.length,
    receipts,
  };
}
