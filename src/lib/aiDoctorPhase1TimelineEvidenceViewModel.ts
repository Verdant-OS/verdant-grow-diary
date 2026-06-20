import {
  AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER,
  AI_DOCTOR_PHASE1_EVIDENCE_LABEL,
  AI_DOCTOR_PHASE1_TIMELINE_KIND,
} from "@/lib/aiDoctorPhase1TimelineDraft";

export const AI_DOCTOR_PHASE1_TIMELINE_BADGE_PRIMARY =
  "AI Doctor Phase 1" as const;
export const AI_DOCTOR_PHASE1_TIMELINE_BADGE_EVIDENCE_ONLY =
  "Evidence only" as const;
export const AI_DOCTOR_PHASE1_TIMELINE_SOURCE_LABEL =
  "AI Doctor Phase 1" as const;
export const AI_DOCTOR_PHASE1_TIMELINE_REVIEW_BASE_PATH =
  "/operator/ai-doctor-phase1" as const;

export interface AiDoctorPhase1TimelineEvidenceEventInput {
  id?: string | null;
  occurred_at?: string | null;
  entry_at?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
  details?: unknown;
}

export interface AiDoctorPhase1TimelineEvidenceLink {
  pathname: typeof AI_DOCTOR_PHASE1_TIMELINE_REVIEW_BASE_PATH;
  href: string;
  plantId: string | null;
  growId: string | null;
  tentId: string | null;
}

export interface AiDoctorPhase1TimelineEvidenceViewModel {
  id: string | null;
  title: typeof AI_DOCTOR_PHASE1_EVIDENCE_LABEL;
  badges: readonly [
    typeof AI_DOCTOR_PHASE1_TIMELINE_BADGE_PRIMARY,
    typeof AI_DOCTOR_PHASE1_TIMELINE_BADGE_EVIDENCE_ONLY,
  ];
  sourceLabel: typeof AI_DOCTOR_PHASE1_TIMELINE_SOURCE_LABEL;
  disclaimer: typeof AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER;
  summary: string;
  likelyIssue: string | null;
  confidence: string | null;
  riskLevel: string | null;
  evidence: readonly string[];
  evidenceCount: number;
  missingInformation: readonly string[];
  missingInformationCount: number;
  occurredAt: string | null;
  savedAtLabel: string | null;
  metadataLine: string | null;
  link: AiDoctorPhase1TimelineEvidenceLink;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = asString(item);
    if (s) out.push(s);
  }
  return out;
}

export function formatAiDoctorPhase1TimelineSavedAt(
  iso: string | null | undefined,
): string | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }).format(new Date(ms)) + " UTC"
    );
  } catch {
    return iso;
  }
}

export function isAiDoctorPhase1EvidenceEvent(
  event: AiDoctorPhase1TimelineEvidenceEventInput | null | undefined,
): boolean {
  if (!event) return false;
  const details = asRecord(event.details);
  if (!details) return false;
  return details.kind === AI_DOCTOR_PHASE1_TIMELINE_KIND;
}

export function buildAiDoctorPhase1TimelineReviewHref(input: {
  plantId?: string | null;
  growId?: string | null;
  tentId?: string | null;
}): AiDoctorPhase1TimelineEvidenceLink {
  const plantId = asString(input.plantId) ?? null;
  const growId = asString(input.growId) ?? null;
  const tentId = asString(input.tentId) ?? null;
  const params = new URLSearchParams();
  if (plantId) params.set("plantId", plantId);
  if (growId) params.set("growId", growId);
  if (tentId) params.set("tentId", tentId);
  const qs = params.toString();
  return {
    pathname: AI_DOCTOR_PHASE1_TIMELINE_REVIEW_BASE_PATH,
    href: qs
      ? `${AI_DOCTOR_PHASE1_TIMELINE_REVIEW_BASE_PATH}?${qs}`
      : AI_DOCTOR_PHASE1_TIMELINE_REVIEW_BASE_PATH,
    plantId,
    growId,
    tentId,
  };
}

export function buildAiDoctorPhase1TimelineEvidenceViewModel(
  event: AiDoctorPhase1TimelineEvidenceEventInput | null | undefined,
): AiDoctorPhase1TimelineEvidenceViewModel | null {
  if (!isAiDoctorPhase1EvidenceEvent(event)) return null;
  const details = asRecord(event!.details) ?? {};
  const result = asRecord(details.result) ?? {};

  const summary =
    asString(result.summary) ??
    asString(details.summary) ??
    "Saved evidence (no summary available).";

  const plantId = asString(event!.plant_id);
  const growId = asString(event!.grow_id);
  const tentId = asString(event!.tent_id);
  const occurredAt =
    asString(event!.occurred_at) ?? asString(event!.entry_at) ?? null;
  const savedAtLabel = formatAiDoctorPhase1TimelineSavedAt(occurredAt);

  return {
    id: asString(event!.id),
    title: AI_DOCTOR_PHASE1_EVIDENCE_LABEL,
    badges: [
      AI_DOCTOR_PHASE1_TIMELINE_BADGE_PRIMARY,
      AI_DOCTOR_PHASE1_TIMELINE_BADGE_EVIDENCE_ONLY,
    ],
    sourceLabel: AI_DOCTOR_PHASE1_TIMELINE_SOURCE_LABEL,
    disclaimer: AI_DOCTOR_PHASE1_EVIDENCE_DISCLAIMER,
    summary,
    likelyIssue: asString(result.likely_issue),
    confidence: asString(result.confidence),
    riskLevel: asString(result.risk_level),
    evidence: asStringArray(result.evidence),
    evidenceCount: asStringArray(result.evidence).length,
    missingInformation: asStringArray(result.missing_information),
    missingInformationCount: asStringArray(result.missing_information).length,
    occurredAt,
    savedAtLabel,
    metadataLine: savedAtLabel ? `Saved ${savedAtLabel}` : null,
    link: buildAiDoctorPhase1TimelineReviewHref({ plantId, growId, tentId }),
  };
}
