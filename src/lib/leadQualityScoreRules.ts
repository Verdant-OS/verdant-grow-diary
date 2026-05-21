/**
 * Pure logic for the read-only Lead Quality Score.
 *
 * UI-only / read-derived. No I/O, no Supabase calls, no side effects.
 * Derives a 0-100 score and letter grade strictly from existing LeadRow
 * fields. Unknown/ambiguous data lowers confidence and surfaces warnings.
 */
import type { LeadRow } from "@/hooks/useLeadsList";
import {
  recommendNextAction,
  type LeadNextActionPriority,
} from "@/lib/leadNextActionRules";

export type LeadQualityGrade = "A" | "B" | "C" | "D" | "F" | "Unknown";

export interface LeadQualityScore {
  score: number; // 0-100
  grade: LeadQualityGrade;
  label: string;
  reasons: string[];
  warnings: string[];
  /** Higher = stronger lead. Stable across calls for the same input. */
  sortWeight: number;
}

const KNOWN_STATUSES = new Set([
  "new",
  "reviewed",
  "contacted",
  "follow_up",
  "closed",
  "spam",
]);

const GENERIC_VALUES = new Set(["other", "unknown", "n/a", "na", "none"]);

function isMeaningful(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function isGeneric(v: string | null | undefined): boolean {
  if (!isMeaningful(v)) return false;
  return GENERIC_VALUES.has((v as string).trim().toLowerCase());
}

function isSpecific(v: string | null | undefined): boolean {
  return isMeaningful(v) && !isGeneric(v);
}

function validTime(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return Number.isFinite(new Date(iso).getTime());
}

function gradeFor(score: number): LeadQualityGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function labelFor(grade: LeadQualityGrade): string {
  switch (grade) {
    case "A":
      return "Excellent";
    case "B":
      return "Strong";
    case "C":
      return "Average";
    case "D":
      return "Weak";
    case "F":
      return "Poor";
    case "Unknown":
      return "Unknown";
  }
}

/**
 * Derive the read-only quality score for a lead.
 *
 * Deterministic: same input always yields the same output (no Date.now()
 * unless `now` is supplied; tests pass a fixed `now`).
 */
export function scoreLeadQuality(
  lead: LeadRow,
  now: number = Date.now(),
): LeadQualityScore {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // Status
  const statusRaw = (lead.status ?? "") as string;
  const statusKnown = KNOWN_STATUSES.has(statusRaw);
  if (!statusKnown) warnings.push("Unknown or missing status");

  // created_at
  const createdValid = validTime(lead.created_at);
  if (createdValid) {
    score += 10;
    reasons.push("Valid created date");
  } else {
    warnings.push("Missing or invalid created_at");
  }

  // Source
  if (isSpecific(lead.source)) {
    score += 12;
    reasons.push("Specific source");
  } else if (isGeneric(lead.source)) {
    score += 4;
    warnings.push("Generic source");
  } else {
    warnings.push("Missing source");
  }

  // Lead type
  if (isSpecific(lead.lead_type)) {
    score += 12;
    reasons.push("Specific lead type");
  } else if (isGeneric(lead.lead_type)) {
    score += 4;
    warnings.push("Generic lead type");
  } else {
    warnings.push("Missing lead type");
  }

  // Identity completeness
  if (isMeaningful(lead.name)) {
    score += 8;
    reasons.push("Name present");
  } else {
    warnings.push("Missing name");
  }
  if (isMeaningful(lead.company)) {
    score += 8;
    reasons.push("Company present");
  }
  if (isMeaningful(lead.role)) {
    score += 5;
    reasons.push("Role present");
  }
  if (isMeaningful(lead.message)) {
    score += 10;
    reasons.push("Message provided");
  }
  if (isMeaningful(lead.operator_notes)) {
    score += 10;
    reasons.push("Operator notes captured");
  }

  // Status engagement contribution
  if (statusKnown) {
    switch (lead.status) {
      case "reviewed":
        score += 5;
        reasons.push("Reviewed");
        break;
      case "contacted":
        score += 15;
        reasons.push("Contacted");
        break;
      case "follow_up":
        score += 15;
        reasons.push("Follow-up active");
        break;
      case "closed":
        score += 10;
        reasons.push("Closed outcome");
        break;
      case "spam":
      case "new":
      default:
        // no engagement bonus
        break;
    }
  }

  // Next-action signal (compatibility with leadNextActionRules)
  const rec = recommendNextAction(lead, now);
  const priorityBoost: Record<LeadNextActionPriority, number> = {
    high: 10,
    medium: 5,
    low: 0,
    none: 0,
  };
  score += priorityBoost[rec.priority] ?? 0;

  // Clamp
  if (score > 100) score = 100;
  if (score < 0) score = 0;

  // Terminal-state adjustments
  if (statusKnown && lead.status === "spam") {
    // Lost leads should score lower; cap at "D" tier.
    if (score > 50) score = 50;
    reasons.push("Spam/lost — score capped");
  }

  // Final grade
  let grade: LeadQualityGrade = gradeFor(score);

  // Confidence guard: if status is unknown AND created_at invalid, we
  // genuinely cannot grade.
  if (!statusKnown && !createdValid) {
    grade = "Unknown";
  }

  return {
    score,
    grade,
    label: labelFor(grade),
    reasons,
    warnings,
    sortWeight: score,
  };
}
