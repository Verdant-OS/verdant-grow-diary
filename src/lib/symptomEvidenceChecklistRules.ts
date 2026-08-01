import { findCannabisSymptomByObservedSign } from "@/constants/cannabisSymptomTypes";
import { classifyTimelineLightingSignal } from "@/lib/timelineLightingGuideRules";
import { buildTimelineEntryAnchorId } from "@/lib/timelineEntryAnchorRules";
import { stageLabel } from "@/lib/grow";
import { normalizeQuickLogStage } from "@/lib/quickLogStageDefaultRules";
import { describeQuickLogActivityDetails } from "@/lib/quickLogActivityDetailFields";
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
  readonly entry_type?: unknown;
  readonly action?: unknown;
  readonly note?: unknown;
  readonly details?: unknown;
  readonly source?: unknown;
  /**
   * Derived Timeline row id that is known to render an anchor. This is
   * populated by buildSymptomEvidenceTimelineRows; database row ids alone do
   * not prove that the Timeline presenter mounted a matching element.
   */
  readonly timeline_anchor_entry_id?: unknown;
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
  readonly verifyNext: string;
  readonly items: ReadonlyArray<SymptomEvidenceItemView>;
}

export interface SymptomEvidenceChecklistView {
  readonly title: string;
  readonly symptomLabel: string;
  readonly observationStageLabel: string | null;
  readonly observationLocationLabel: string | null;
  readonly observedAt: string;
  readonly guidePath: string;
  readonly hubPath: string;
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
  readonly logicalIds: ReadonlyArray<string>;
  readonly growId: string | null;
  readonly tentId: string | null;
  readonly plantId: string | null;
  readonly occurredAt: string | null;
  readonly occurredMs: number | null;
  readonly eventType: string;
  readonly note: string;
  readonly details: Record<string, unknown>;
  readonly source: string | null;
  readonly timelineAnchorEntryId: string | null;
}

const CATEGORY_TITLES: Readonly<Record<SymptomEvidenceCategoryId, string>> = {
  environment: "Environment Check",
  watering: "Watering",
  feeding: "Feeding",
  lighting: "Lighting",
};

const CATEGORY_VERIFY_NEXT: Readonly<Record<SymptomEvidenceCategoryId, string>> = {
  environment:
    "Compare the recorded Environment Check, timestamp, source, canopy placement, calibration basis, and leaf-temperature basis.",
  watering:
    "Compare watering timing, volume, input pH and EC, runoff, and dryback notes for this plant.",
  feeding:
    "Compare feeding timing, recipe, input EC and pH, runoff, and the plant response you recorded.",
  lighting:
    "Compare light notes, PPFD or DLI when measured, fixture distance, schedule, and recent position changes for this tent.",
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
  const withoutControlCharacters = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f ? " " : character;
  }).join("");
  const cleaned = withoutControlCharacters.replace(/\s+/g, " ").trim();
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
  const details = safeDetails(entry.details);
  const eventType = (
    safeString(entry.event_type ?? entry.entry_type ?? details.event_type ?? entry.action, 64) ?? ""
  ).toLowerCase();
  const id = safeId(entry.id);
  const logicalIds = [
    id,
    safeId(details.linked_grow_event_id),
    safeId(details.grow_event_id),
  ].filter((value): value is string => Boolean(value));
  return {
    id: id ?? "unknown",
    logicalIds: [...new Set(logicalIds)],
    growId: safeId(entry.grow_id),
    tentId: safeId(entry.tent_id),
    plantId: safeId(entry.plant_id),
    occurredAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
    occurredMs: Number.isFinite(parsed) ? parsed : null,
    eventType,
    note: safeString(entry.note, 220) ?? "",
    details,
    // Only the explicit row-level source seam is eligible for provenance.
    // A diary JSON details.source field is grower-controlled legacy metadata,
    // not proof that a reading or observation came from a trusted live path.
    source: safeString(entry.source, 24)?.toLowerCase() ?? null,
    timelineAnchorEntryId: safeId(entry.timeline_anchor_entry_id),
  };
}

export interface BuildSymptomEvidenceTimelineRowsInput {
  readonly growId?: unknown;
  readonly recentLaneEntries: ReadonlyArray<SymptomEvidenceRawEntry>;
  readonly diaryEntries: ReadonlyArray<SymptomEvidenceRawEntry>;
  readonly growEvents: ReadonlyArray<SymptomEvidenceRawEntry>;
  /** Diary row ids whose primary or companion-alias anchors are mounted. */
  readonly renderedDiaryEntryIds: ReadonlySet<string>;
}

function companionMatchesParent(
  companion: SymptomEvidenceRawEntry,
  parent: SymptomEvidenceRawEntry,
): boolean {
  const companionDetails = safeDetails(companion.details);
  const parentPlantId = safeId(parent.plant_id);
  const companionPlantId = safeId(companion.plant_id);
  if (parentPlantId && companionPlantId && parentPlantId !== companionPlantId) return false;

  const parentTentId = safeId(parent.tent_id);
  const companionTentId = safeId(companion.tent_id);
  if (parentTentId && companionTentId && parentTentId !== companionTentId) return false;

  const parentEventType = safeString(parent.event_type ?? parent.entry_type ?? parent.action, 64);
  const companionEventType = safeString(
    companion.event_type ?? companion.entry_type ?? companionDetails.event_type ?? companion.action,
    64,
  );
  return !parentEventType || !companionEventType || parentEventType === companionEventType;
}

function canSafelyMergeCompanionDetails(parent: SymptomEvidenceRawEntry): boolean {
  const parentSource = safeString(parent.source, 24)?.toLowerCase() ?? null;
  return (
    !parentSource ||
    parentSource === "manual" ||
    !Object.prototype.hasOwnProperty.call(SOURCE_LABELS, parentSource)
  );
}

/**
 * Preserve structured diary-companion evidence only when its row-level label
 * can honestly remain manual or unverified. Canonical non-manual parents keep
 * only their native lane details because this model cannot express per-field
 * provenance without falsely promoting client-controlled companion fields.
 */
export function buildSymptomEvidenceTimelineRows(
  input: BuildSymptomEvidenceTimelineRowsInput,
): SymptomEvidenceRawEntry[] {
  const loadedDiaryEntryIds = new Set(
    input.diaryEntries.map((row) => safeId(row.id)).filter((id): id is string => Boolean(id)),
  );
  const renderedDiaryEntryIds = new Set(
    [...input.renderedDiaryEntryIds]
      .map((id) => safeId(id))
      .filter((id): id is string => Boolean(id)),
  );
  const growEventById = new Map<string, SymptomEvidenceRawEntry>();
  for (const row of input.growEvents) {
    const id = safeId(row.id);
    if (id && !growEventById.has(id)) growEventById.set(id, row);
  }

  const companionByGrowEventId = new Map<string, SymptomEvidenceRawEntry>();
  for (const row of input.diaryEntries) {
    const details = safeDetails(row.details);
    const linkedId = safeId(details.linked_grow_event_id ?? details.grow_event_id);
    if (!linkedId || companionByGrowEventId.has(linkedId)) continue;
    const parent = growEventById.get(linkedId);
    if (parent && companionMatchesParent(row, parent)) {
      companionByGrowEventId.set(linkedId, row);
    }
  }

  return input.recentLaneEntries.map((row) => {
    const id = safeId(row.id);
    const parent = id ? growEventById.get(id) : undefined;
    const companion = id ? companionByGrowEventId.get(id) : undefined;
    const companionDetails = companion ? safeDetails(companion.details) : {};
    const laneDetails = safeDetails(row.details);
    const anchorOwnerDiaryEntryId = parent
      ? safeId(companion?.id)
      : id && loadedDiaryEntryIds.has(id)
        ? id
        : null;
    const timelineAnchorEntryId =
      id && anchorOwnerDiaryEntryId && renderedDiaryEntryIds.has(anchorOwnerDiaryEntryId)
        ? id
        : null;
    const details =
      companion && parent && canSafelyMergeCompanionDetails(parent)
        ? { ...companionDetails, ...laneDetails }
        : laneDetails;
    return {
      ...row,
      grow_id: row.grow_id ?? parent?.grow_id ?? input.growId,
      tent_id: row.tent_id ?? parent?.tent_id ?? companion?.tent_id,
      plant_id: row.plant_id ?? parent?.plant_id ?? companion?.plant_id,
      occurred_at:
        row.occurred_at ??
        row.entry_at ??
        parent?.occurred_at ??
        companion?.occurred_at ??
        companion?.entry_at,
      event_type:
        parent?.event_type ?? row.event_type ?? row.entry_type ?? details.event_type ?? row.action,
      details,
      // Never promote diary details.source. A matched grow_events row owns
      // provenance; an unmatched diary row stays unverified (except the
      // explicit canonical manual Environment Check envelope handled later).
      source: parent?.source ?? null,
      // A grow-event id becomes linkable only when a validated diary
      // companion renders its hidden alias. Unmatched diary rows use their
      // visible primary anchor; grow-event-only rows intentionally stay
      // unlinked because Timeline does not render a matching element.
      timeline_anchor_entry_id: timelineAnchorEntryId,
    };
  });
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
  if (symptom.tentId) {
    if (candidate.tentId) return candidate.tentId === symptom.tentId;
    return samePlant(candidate, symptom);
  }
  return samePlant(candidate, symptom);
}

function isSameLogicalEvent(candidate: NormalizedEntry, symptom: NormalizedEntry): boolean {
  if (candidate.logicalIds.length === 0 || symptom.logicalIds.length === 0) return false;
  const symptomIds = new Set(symptom.logicalIds);
  return candidate.logicalIds.some((id) => symptomIds.has(id));
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
  const hasCanonicalEnvironmentCheck =
    entry.details.environment_check !== null &&
    typeof entry.details.environment_check === "object" &&
    !Array.isArray(entry.details.environment_check);
  if (
    category === "environment" &&
    (entry.source === "manual" || (!entry.source && hasCanonicalEnvironmentCheck))
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
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim().length > 0
            ? Number(value)
            : Number.NaN;
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
    verifyNext: CATEGORY_VERIFY_NEXT[id],
    items: matches.slice(0, MAX_ITEMS_PER_CATEGORY).map((entry) => {
      const timelineAnchor = entry.timelineAnchorEntryId
        ? buildTimelineEntryAnchorId(entry.timelineAnchorEntryId)
        : null;
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
    !symptomDefinition ||
    symptom.occurredAt === null ||
    symptom.occurredMs === null
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
        isSameLogicalEvent(entry, symptom) ||
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
  const observationLocationLabel =
    describeQuickLogActivityDetails("issue_observation", symptom.details).find(
      (line) => line.key === "observationLocation",
    )?.value ?? null;
  return {
    title: `${symptomDefinition.label}: verify the record before changing anything`,
    symptomLabel: symptomDefinition.label,
    observationStageLabel: (() => {
      const stage = normalizeQuickLogStage(
        typeof symptom.details.observation_stage === "string"
          ? symptom.details.observation_stage
          : null,
      );
      return stage ? stageLabel(stage) : null;
    })(),
    observationLocationLabel,
    observedAt: symptom.occurredAt!,
    guidePath: symptomDefinition.guidePath,
    hubPath: "/guides/cannabis-leaf-symptoms",
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
