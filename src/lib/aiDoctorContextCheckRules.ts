import { buildAttributedPricingPath } from "@/lib/paidAcquisitionAttributionRules";

export const AI_DOCTOR_CONTEXT_CHECK_PATH = "/ai-doctor-readiness-check" as const;
export const AI_DOCTOR_CONTEXT_CHECK_ORIGIN = "https://verdantgrowdiary.com" as const;

export type AiDoctorContextKey =
  | "plant_stage"
  | "strain"
  | "medium"
  | "pot_size"
  | "recent_watering"
  | "recent_feeding"
  | "sensor_snapshots"
  | "recent_photos"
  | "diary_entries"
  | "alerts"
  | "grow_targets"
  | "plant_history";

export type AiDoctorContextReadiness = "insufficient" | "partial" | "strong";

export interface AiDoctorContextCategory {
  key: AiDoctorContextKey;
  label: string;
  description: string;
  core: boolean;
}

/**
 * The complete AI Doctor context contract, kept as pure data so the public
 * utility and its tests cannot drift into a JSX-only policy table.
 */
export const AI_DOCTOR_CONTEXT_CATEGORIES: ReadonlyArray<AiDoctorContextCategory> = Object.freeze([
  Object.freeze({
    key: "plant_stage",
    label: "Plant stage",
    description: "Seedling, vegetative, transition, flower, or recovery stage.",
    core: true,
  }),
  Object.freeze({
    key: "strain",
    label: "Strain or cultivar",
    description: "Known genetics, cultivar, or an explicit unknown label.",
    core: false,
  }),
  Object.freeze({
    key: "medium",
    label: "Growing medium",
    description: "Soil, coco, hydro, living soil, or another root-zone medium.",
    core: true,
  }),
  Object.freeze({
    key: "pot_size",
    label: "Pot size or reservoir volume",
    description: "Container size, bed volume, or hydro reservoir volume.",
    core: true,
  }),
  Object.freeze({
    key: "recent_watering",
    label: "Recent watering",
    description: "When, how much, and how the root zone responded.",
    core: true,
  }),
  Object.freeze({
    key: "recent_feeding",
    label: "Recent feeding",
    description: "Recent nutrients, amendments, pH, or EC context when relevant.",
    core: true,
  }),
  Object.freeze({
    key: "sensor_snapshots",
    label: "Sensor snapshots",
    description: "Fresh, source-labeled environment or root-zone readings.",
    core: false,
  }),
  Object.freeze({
    key: "recent_photos",
    label: "Recent photos",
    description: "Clear recent photos with enough context to compare change.",
    core: false,
  }),
  Object.freeze({
    key: "diary_entries",
    label: "Diary entries",
    description: "Recent observations and actions recorded in sequence.",
    core: false,
  }),
  Object.freeze({
    key: "alerts",
    label: "Active or recent alerts",
    description: "Known alerts, including an explicit note that none are active.",
    core: false,
  }),
  Object.freeze({
    key: "grow_targets",
    label: "Grow targets",
    description: "The grower's current environmental or cultivation targets.",
    core: true,
  }),
  Object.freeze({
    key: "plant_history",
    label: "Plant history",
    description: "Earlier stress, recovery, training, transplant, or treatment context.",
    core: false,
  }),
]);

const VALID_KEYS = new Set<AiDoctorContextKey>(
  AI_DOCTOR_CONTEXT_CATEGORIES.map((category) => category.key),
);
const CORE_KEYS = AI_DOCTOR_CONTEXT_CATEGORIES.filter((category) => category.core).map(
  (category) => category.key,
);
const CURRENT_EVIDENCE_KEYS: ReadonlyArray<AiDoctorContextKey> = [
  "sensor_snapshots",
  "recent_photos",
  "alerts",
];
const HISTORY_KEYS: ReadonlyArray<AiDoctorContextKey> = ["diary_entries", "plant_history"];

export interface AiDoctorContextCheckResult {
  readiness: AiDoctorContextReadiness;
  completedCount: number;
  totalCount: number;
  coveragePercent: number;
  selectedKeys: ReadonlyArray<AiDoctorContextKey>;
  missingKeys: ReadonlyArray<AiDoctorContextKey>;
  missingCoreKeys: ReadonlyArray<AiDoctorContextKey>;
  nextKeys: ReadonlyArray<AiDoctorContextKey>;
  summary: string;
}

function normalizeSelectedKeys(input: unknown): Set<AiDoctorContextKey> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return new Set();

  const selected = new Set<AiDoctorContextKey>();
  for (const [key, value] of Object.entries(input)) {
    if (value === true && VALID_KEYS.has(key as AiDoctorContextKey)) {
      selected.add(key as AiDoctorContextKey);
    }
  }
  return selected;
}

function hasAny(
  selected: ReadonlySet<AiDoctorContextKey>,
  keys: ReadonlyArray<AiDoctorContextKey>,
) {
  return keys.some((key) => selected.has(key));
}

function readinessSummary(readiness: AiDoctorContextReadiness): string {
  if (readiness === "strong") {
    return "Your context has enough breadth for a structured review. It still cannot prove a diagnosis or justify certainty by itself.";
  }
  if (readiness === "partial") {
    return "You have a useful starting point, but the missing context should keep confidence limited and next steps cautious.";
  }
  return "Too many core or evidence gaps remain for a responsible review. Capture context before acting on a diagnosis.";
}

/**
 * Measures context coverage only. It never evaluates plant health, predicts a
 * diagnosis, or recommends a cultivation action.
 *
 * Strong requires every core field (including pot size and grow targets), at
 * least one current observation, at least one historical source, and nine of
 * the twelve categories overall. Partial still requires five categories,
 * three core fields, and either current or historical evidence.
 */
export function evaluateAiDoctorContext(input: unknown): AiDoctorContextCheckResult {
  const selected = normalizeSelectedKeys(input);
  const selectedKeys = AI_DOCTOR_CONTEXT_CATEGORIES.map((category) => category.key).filter((key) =>
    selected.has(key),
  );
  const missingKeys = AI_DOCTOR_CONTEXT_CATEGORIES.map((category) => category.key).filter(
    (key) => !selected.has(key),
  );
  const missingCoreKeys = CORE_KEYS.filter((key) => !selected.has(key));
  const completedCount = selectedKeys.length;
  const hasCurrentEvidence = hasAny(selected, CURRENT_EVIDENCE_KEYS);
  const hasHistory = hasAny(selected, HISTORY_KEYS);
  const completedCoreCount = CORE_KEYS.length - missingCoreKeys.length;

  let readiness: AiDoctorContextReadiness = "insufficient";
  if (completedCount >= 9 && missingCoreKeys.length === 0 && hasCurrentEvidence && hasHistory) {
    readiness = "strong";
  } else if (completedCount >= 5 && completedCoreCount >= 3 && (hasCurrentEvidence || hasHistory)) {
    readiness = "partial";
  }

  const prioritizedMissing = [
    ...missingCoreKeys,
    ...(!hasCurrentEvidence ? CURRENT_EVIDENCE_KEYS.filter((key) => !selected.has(key)) : []),
    ...(!hasHistory ? HISTORY_KEYS.filter((key) => !selected.has(key)) : []),
    ...missingKeys,
  ];

  return {
    readiness,
    completedCount,
    totalCount: AI_DOCTOR_CONTEXT_CATEGORIES.length,
    coveragePercent: Math.round((completedCount / AI_DOCTOR_CONTEXT_CATEGORIES.length) * 100),
    selectedKeys,
    missingKeys,
    missingCoreKeys,
    nextKeys: [...new Set(prioritizedMissing)].slice(0, 3),
    summary: readinessSummary(readiness),
  };
}

export function getAiDoctorContextCategory(key: AiDoctorContextKey): AiDoctorContextCategory {
  return AI_DOCTOR_CONTEXT_CATEGORIES.find((category) => category.key === key)!;
}

export function buildAiDoctorContextPricingPath(): string {
  return buildAttributedPricingPath({ source: "context_check" });
}

export interface AiDoctorContextShareData {
  title: string;
  text: string;
  url: string;
}

/** A fixed, PII-free share link. The grower's selections never enter the URL. */
export function buildAiDoctorContextShareData(): AiDoctorContextShareData {
  const params = new URLSearchParams({
    utm_source: "context_check_share",
    utm_medium: "referral",
    utm_campaign: "ai_doctor_context_check",
  });
  return {
    title: "AI Doctor Context Check | Verdant",
    text: "Check whether you have enough grow context for a cautious plant review—without uploading plant data or pretending a diagnosis is certain.",
    url: `${AI_DOCTOR_CONTEXT_CHECK_ORIGIN}${AI_DOCTOR_CONTEXT_CHECK_PATH}?${params.toString()}`,
  };
}
