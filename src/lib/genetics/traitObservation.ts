export type TraitExpression = "absent" | "weak" | "moderate" | "strong" | "present";
export type TraitObservationConfidence = "low" | "medium" | "high";

export interface TraitObservationDetails {
  observation_type: "trait_observation";
  trait_key: string;
  trait_label: string;
  expression: TraitExpression;
  confidence?: TraitObservationConfidence;
  notes?: string;
}

export interface NormalizedTraitObservation {
  event_id: string;
  plant_id?: string;
  grow_id?: string;
  observed_at: string;
  trait_key: string;
  trait_label: string;
  expression: TraitExpression;
  confidence?: TraitObservationConfidence;
  notes?: string;
}

export interface TraitObservationSummary {
  trait_key: string;
  trait_label: string;
  latest_observation_date: string | null;
  counts: {
    absent: number;
    weak: number;
    moderate: number;
    strong: number;
    present: number;
    total: number;
  };
}

export function normalizeTraitExpression(value: unknown): TraitExpression | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase().trim();
  if (
    normalized === "absent" ||
    normalized === "weak" ||
    normalized === "moderate" ||
    normalized === "strong" ||
    normalized === "present"
  ) {
    return normalized as TraitExpression;
  }
  return undefined;
}

export function normalizeTraitObservationConfidence(value: unknown): TraitObservationConfidence | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase().trim();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized as TraitObservationConfidence;
  }
  return undefined;
}

export function isTraitObservationDetails(details: unknown): details is TraitObservationDetails {
  if (!details || typeof details !== "object") return false;
  const d = details as Record<string, unknown>;
  
  if (d.observation_type !== "trait_observation") return false;
  if (typeof d.trait_key !== "string" || d.trait_key.trim() === "") return false;
  if (typeof d.trait_label !== "string" || d.trait_label.trim() === "") return false;
  
  if (!normalizeTraitExpression(d.expression)) return false;

  return true;
}

export function normalizeTraitObservationEvent(event: any): NormalizedTraitObservation | undefined {
  if (!event || !event.id) return undefined;
  if (!isTraitObservationDetails(event.details)) return undefined;

  return {
    event_id: event.id,
    plant_id: event.plant_id || event.plantId || undefined, // handle snake and camel case gently
    grow_id: event.grow_id || event.growId || undefined,
    observed_at: event.occurred_at || event.observed_at || new Date().toISOString(),
    trait_key: event.details.trait_key.trim(),
    trait_label: event.details.trait_label.trim(),
    expression: normalizeTraitExpression(event.details.expression)!,
    confidence: normalizeTraitObservationConfidence(event.details.confidence),
    notes: typeof event.details.notes === "string" ? event.details.notes : undefined,
  };
}

export function summarizeTraitObservations(events: any[]): Record<string, TraitObservationSummary> {
  const summaries: Record<string, TraitObservationSummary> = {};

  if (!Array.isArray(events)) return summaries;

  for (const event of events) {
    const normalized = normalizeTraitObservationEvent(event);
    if (!normalized) continue;

    if (!summaries[normalized.trait_key]) {
      summaries[normalized.trait_key] = {
        trait_key: normalized.trait_key,
        trait_label: normalized.trait_label,
        latest_observation_date: null,
        counts: { absent: 0, weak: 0, moderate: 0, strong: 0, present: 0, total: 0 }
      };
    }

    const summary = summaries[normalized.trait_key];
    summary.counts[normalized.expression]++;
    summary.counts.total++;

    if (!summary.latest_observation_date || new Date(normalized.observed_at) > new Date(summary.latest_observation_date)) {
      summary.latest_observation_date = normalized.observed_at;
    }
  }

  return summaries;
}
