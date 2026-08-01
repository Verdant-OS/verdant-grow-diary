import { findCannabisSymptomByObservedSign } from "@/constants/cannabisSymptomTypes";
import { classifyTimelineLightingSignal } from "@/lib/timelineLightingGuideRules";
import { buildTimelineEntryAnchorId } from "@/lib/timelineEntryAnchorRules";
import { formatGrowStageLabel, normalizeGrowStage } from "@/constants/growStages";
import { timelinePath } from "@/lib/routes";

export const SYMPTOM_EVIDENCE_LOOKBACK_DAYS = 14;
const LOOKBACK_MS = SYMPTOM_EVIDENCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
const MAX_ITEMS_PER_CATEGORY = 3;

export type SymptomEvidenceCategoryId = "environment" | "watering" | "feeding" | "lighting";
export type SymptomEvidenceStatus = "recorded" | "missing" | "limited";
export type SymptomEvidenceOverallState =
  | "ready_to_compare"
  | "partial_evidence"
  | "insufficient_evidence";

export interface SymptomEvidenceRawEntry {
  readonly id?: unknown;
  readonly grow_id?: unknown;
  readonly tent_id?: unknown;
  readonly plant_id?: unknown;
  readonly entry_at?: unknown;
  readonly occurred_at?: unknown;
  readonly event_type?: unknown;
  readonly action?: unknown;
  readonly note?: unknown;
  readonly details?: unknown;
  readonly source?: unknown;
}

export interface SymptomEvidenceItemView {
  readonly id: string;
  readonly occurredAt: string;
  readonly sourceLabel: string;
  readonly summary: string;
  readonly detailLines: ReadonlyArray<string>;
  readonly timelineAnchor: string | null;
  readonly timelineHref: string | null;
}

export interface SymptomEvidenceCategoryView {
  readonly id: SymptomEvidenceCategoryId;
  readonly title: string;
  readonly status: SymptomEvidenceStatus;
  readonly statusText: string;
  readonly totalMatches: number;
  readonly items: ReadonlyArray<SymptomEvidenceItemView>;
}

export interface SymptomEvidenceChecklistView {
  readonly symptomLabel: string;
  readonly observationStageLabel: string | null;
  readonly guidePath: string;
  readonly overallState: SymptomEvidenceOverallState;
  readonly windowLabel: string;
  readonly categories: ReadonlyArray<SymptomEvidenceCategoryView>;
  readonly historyComplete: boolean;
}

export interface BuildSymptomEvidenceChecklistInput {
  readonly symptomEntry: SymptomEvidenceRawEntry;
  readonly entries: ReadonlyArray<SymptomEvidenceRawEntry>;
  readonly historyComplete: boolean;
}

interface NormalizedEntry {
  readonly id: string;
  readonly growId: string | null;
  readonly tentId: string | null;
  readonly plantId: string | null;
  readonly occurredAt: string | null;
  readonly occurredMs: number | null;
  readonly eventType: string;
  readonly note: string;
  readonly details: Record<string, unknown>;
  readonly source: string | null;
}

const CATEGORY_TITLES: Readonly<Record<SymptomEvidenceCategoryId, string>> = {
  environment: "Environment Check",
  watering: "Watering",
  feeding: "Feeding",
  lighting: "Lighting",
};

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  live: "live",
  manual: "manual",
  csv: "csv",
  demo: "demo",
  stale: "stale",
  invalid: "invalid",
};

function safeString(value: unknown, max = 220): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, max) : null;
}

function safeId(value: unknown): string | null {
  const result = safeString(value, 128);
  return result && /^[A-Za-z0-9_-]+$/.test(result) ? result : null;
}

function safeDetails(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeEntry(entry: SymptomEvidenceRawEntry): NormalizedEntry {
  const occurredAt = safeString(entry.occurred_at ?? entry.entry_at, 64);
  const parsed = occurredAt ? Date.parse(occurredAt) : Number.NaN;
  const eventType = (
    safeString(entry.event_type ?? safeDetails(entry.details).event_type ?? entry.action, 64) ?? ""
  ).toLowerCase();
  return {
    id: safeId(entry.id) ?? "unknown",
    growId: safeId(entry.grow_id),
    tentId: safeId(entry.tent_id),
    plantId: safeId(entry.plant_id),
    occurredAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
    occurredMs: Number.isFinite(parsed) ? parsed : null,
    eventType,
    note: safeString(entry.note, 220) ?? "",
    details: safeDetails(entry.details),
    source:
      safeString(entry.source ?? safeDetails(entry.details).source, 24)?.toLowerCase() ?? null,
  };
}

function isWithinWindow(candidate: NormalizedEntry, symptomMs: number): boolean {
  return (
    candidate.occurredMs !== null &&
    candidate.occurredMs <= symptomMs &&
    candidate.occurredMs >= symptomMs - LOOKBACK_MS
  );
}

function samePlant(candidate: NormalizedEntry, symptom: NormalizedEntry): boolean {
  return Boolean(symptom.plantId && candidate.plantId === symptom.plantId);
}

function sameTentOrPlant(candidate: NormalizedEntry, symptom: NormalizedEntry): boolean {
  if (samePlant(candidate, symptom)) return true;
  return Boolean(symptom.tentId && candidate.tentId === symptom.tentId);
}

function classifyEntryCategories(entry: NormalizedEntry): ReadonlyArray<SymptomEvidenceCategoryId> {
  if (/water/.test(entry.eventType)) return ["watering"];
  if (/feed|nutrient/.test(entry.eventType)) return ["feeding"];
  const categories: SymptomEvidenceCategoryId[] = [];
  if (/environment|sensor|climate/.test(entry.eventType)) categories.push("environment");
  if (classifyTimelineLightingSignal({ note: entry.note, details: entry.details })) {
    categories.push("lighting");
  }
  return categories;
}

function sourceLabel(entry: NormalizedEntry, category: SymptomEvidenceCategoryId): string {
  if (
    category === "environment" &&
    (entry.source === "manual" || (!entry.source && entry.eventType === "environment"))
  ) {
    return "Manual observation";
  }
  return entry.source ? (SOURCE_LABELS[entry.source] ?? "Unverified source") : "Unverified source";
}

function numericDetail(
  details: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): number | null {
  const scopes = [
    details,
    safeDetails(details.environment_check),
    safeDetails(details.sensor_snapshot),
  ];
  for (const scope of scopes) {
    for (const key of keys) {
      const value = scope[key];
      const parsed =
        typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function friendlyDetails(
  entry: NormalizedEntry,
  category: SymptomEvidenceCategoryId,
): ReadonlyArray<string> {
  const result: string[] = [];
  const d = entry.details;
  const add = (label: string, value: number | null, unit: string) => {
    if (value !== null && result.length < 3) result.push(`${label}: ${value} ${unit}`);
  };
  if (category === "environment") {
    add("Temperature", numericDetail(d, ["temperature_c", "temp_c"]), "°C");
    add("Humidity", numericDetail(d, ["humidity_pct", "rh_pct"]), "% RH");
    add("VPD", numericDetail(d, ["vpd_kpa"]), "kPa");
  } else if (category === "watering") {
    add("Volume", numericDetail(d, ["watering_amount_ml", "volume_ml", "amount_ml"]), "mL");
    add("Input pH", numericDetail(d, ["ph", "input_ph"]), "pH");
    add("Runoff", numericDetail(d, ["runoff_ml"]), "mL");
  } else if (category === "feeding") {
    add("Input EC", numericDetail(d, ["ec", "input_ec"]), "mS/cm");
    add("Runoff EC", numericDetail(d, ["ec_out", "runoff_ec"]), "mS/cm");
    add("Input pH", numericDetail(d, ["ph", "input_ph"]), "pH");
  } else {
    add("PPFD", numericDetail(d, ["ppfd"]), "µmol/m²/s");
    add("DLI", numericDetail(d, ["dli"]), "mol/m²/day");
    add("Distance", numericDetail(d, ["distance_cm", "canopy_distance_cm"]), "cm");
  }
  return result;
}

function itemSummary(entry: NormalizedEntry, category: SymptomEvidenceCategoryId): string {
  if (entry.note) return entry.note;
  if (category === "watering") return "Watering event recorded.";
  if (category === "feeding") return "Feeding event recorded.";
  if (category === "lighting") return "Lighting context recorded.";
  return "Environment observation recorded.";
}

function statusFor(
  matches: ReadonlyArray<NormalizedEntry>,
  historyComplete: boolean,
  scopeAvailable: boolean,
): SymptomEvidenceStatus {
  if (matches.length > 0) return "recorded";
  return historyComplete && scopeAvailable ? "missing" : "limited";
}

function categoryView(
  id: SymptomEvidenceCategoryId,
  matches: ReadonlyArray<NormalizedEntry>,
  historyComplete: boolean,
  scopeAvailable: boolean,
  growId: string | null,
): SymptomEvidenceCategoryView {
  const status = statusFor(matches, historyComplete, scopeAvailable);
  const statusText =
    status === "recorded"
      ? historyComplete
        ? "Recorded in the prior 14 days"
        : "Recorded; older history may be incomplete"
      : status === "missing"
        ? "No matching record in the prior 14 days"
        : "History or scope is incomplete; absence cannot be confirmed";
  return {
    id,
    title: CATEGORY_TITLES[id],
    status,
    statusText,
    totalMatches: matches.length,
    items: matches.slice(0, MAX_ITEMS_PER_CATEGORY).map((entry) => {
      const timelineAnchor = entry.id === "unknown" ? null : buildTimelineEntryAnchorId(entry.id);
      return {
        id: entry.id,
        occurredAt: entry.occurredAt!,
        sourceLabel: sourceLabel(entry, id),
        summary: itemSummary(entry, id),
        detailLines: friendlyDetails(entry, id),
        timelineAnchor,
        timelineHref: growId && timelineAnchor ? `${timelinePath(growId)}#${timelineAnchor}` : null,
      };
    }),
  };
}

export function buildSymptomEvidenceChecklist(
  input: BuildSymptomEvidenceChecklistInput,
): SymptomEvidenceChecklistView | null {
  const symptom = normalizeEntry(input.symptomEntry);
  const symptomDefinition = findCannabisSymptomByObservedSign(symptom.details.observedSign);
  if (
    symptom.eventType !== "observation" ||
    symptom.details.subtype !== "issue" ||
    !symptomDefinition
  ) {
    return null;
  }

  const categoryMatches: Record<SymptomEvidenceCategoryId, NormalizedEntry[]> = {
    environment: [],
    watering: [],
    feeding: [],
    lighting: [],
  };
  if (symptom.occurredMs !== null && symptom.growId) {
    for (const raw of input.entries) {
      const entry = normalizeEntry(raw);
      if (
        entry.id === symptom.id ||
        entry.growId !== symptom.growId ||
        !isWithinWindow(entry, symptom.occurredMs)
      ) {
        continue;
      }
      const categories = classifyEntryCategories(entry);
      for (const category of categories) {
        if ((category === "watering" || category === "feeding") && !samePlant(entry, symptom))
          continue;
        if (
          (category === "environment" || category === "lighting") &&
          !sameTentOrPlant(entry, symptom)
        )
          continue;
        categoryMatches[category].push(entry);
      }
    }
  }

  const sortNewest = (a: NormalizedEntry, b: NormalizedEntry) =>
    (b.occurredMs ?? 0) - (a.occurredMs ?? 0) || a.id.localeCompare(b.id);
  for (const matches of Object.values(categoryMatches)) matches.sort(sortNewest);

  const canUsePlantScope = Boolean(
    symptom.growId && symptom.plantId && symptom.occurredMs !== null,
  );
  const canUseTentScope = Boolean(
    symptom.growId && (symptom.tentId || symptom.plantId) && symptom.occurredMs !== null,
  );
  const categories = (["environment", "watering", "feeding", "lighting"] as const).map((id) =>
    categoryView(
      id,
      categoryMatches[id],
      input.historyComplete,
      id === "watering" || id === "feeding" ? canUsePlantScope : canUseTentScope,
      symptom.growId,
    ),
  );
  const recordedCount = categories.filter((category) => category.status === "recorded").length;
  return {
    symptomLabel: symptomDefinition.label,
    observationStageLabel: (() => {
      const stage = normalizeGrowStage(
        typeof symptom.details.observation_stage === "string"
          ? symptom.details.observation_stage
          : null,
      );
      return stage ? formatGrowStageLabel(stage) : null;
    })(),
    guidePath: symptomDefinition.guidePath,
    overallState:
      recordedCount === categories.length && input.historyComplete
        ? "ready_to_compare"
        : recordedCount > 0
          ? "partial_evidence"
          : "insufficient_evidence",
    windowLabel: "Prior 14 days, including the observation time",
    categories,
    historyComplete: input.historyComplete,
  };
}
