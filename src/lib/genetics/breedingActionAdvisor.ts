/**
 * breedingActionAdvisor — pure, side-effect free advisor for breeding follow-ups.
 *
 * Consumes a minimal grow_event shape after a successful Quick Log save.
 * Returns zero or more SuggestedAction descriptors (never writes, never mutates).
 *
 * All branching is deterministic and conservative:
 * - No device control.
 * - No auto execution.
 * - Only advisory titles + offsets + risk + reason + next steps.
 */

export interface BreedingEventLike {
  id?: string;
  event_type: string;
  occurred_at?: string | null;
  grow_id?: string | null;
  plant_id?: string | null; // alias for related_plant
  tent_id?: string | null;
  details?: Record<string, unknown> | null;
}

export interface SuggestedAction {
  title: string;
  due_offset_days: number;
  risk_level: "high" | "medium" | "low";
  reason: string;
  next_steps?: string[];
  source_event_id?: string;
}

const BREEDING_EVENT_TYPES = [
  "reversal_application",
  "isolation_start",
  "pollination",
  "pollen_shed_observed",
  "stigmas_receptive",
  "cross_harvest",
] as const;

export function isSupportedBreedingEventType(eventType: string): boolean {
  if (!eventType) return false;
  const t = eventType.toLowerCase().trim();
  return (BREEDING_EVENT_TYPES as readonly string[]).includes(t);
}

function normalizeIntensity(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toLowerCase().trim();
}

function normalizeMethod(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toLowerCase().trim().replace(/\s+/g, "_");
}

function formatEventDate(occurredAt?: string | null): string {
  if (!occurredAt) return "unknown date";
  try {
    const d = new Date(occurredAt);
    if (isNaN(d.getTime())) return "unknown date";
    return d.toISOString().slice(0, 10);
  } catch {
    return "unknown date";
  }
}

export function suggestBreedingFollowUpActions(event: BreedingEventLike): SuggestedAction[] {
  const eventType = (event?.event_type || "").toLowerCase().trim();
  if (!isSupportedBreedingEventType(eventType)) {
    return [];
  }

  const details = (event?.details ?? {}) as Record<string, unknown>;
  const eventId = event?.id;
  const eventDate = formatEventDate(event?.occurred_at);

  const withSource = (s: SuggestedAction): SuggestedAction => ({
    ...s,
    source_event_id: eventId,
  });

  if (eventType === "pollen_shed_observed") {
    const intensity = normalizeIntensity(details.intensity);

    if (intensity === "heavy") {
      return [
        withSource({
          title: "Inspect receivers for receptive stigmas",
          due_offset_days: 1,
          risk_level: "high",
          reason: `Heavy pollen shed observed on ${eventDate}. Receivers may now be in peak receptive window.`,
          next_steps: [
            'Log "stigmas_receptive" if stigmas are white and sticky',
            "Consider performing pollination within the next 48 hours if not already done",
          ],
        }),
      ];
    }

    if (intensity === "moderate") {
      return [
        withSource({
          title: "Inspect receivers for receptive stigmas",
          due_offset_days: 2,
          risk_level: "medium",
          reason: `Moderate pollen shed observed on ${eventDate}. Receivers may be entering receptive window.`,
          next_steps: [
            'Log "stigmas_receptive" if stigmas are white and sticky',
            "Monitor daily for the next 3 days",
          ],
        }),
      ];
    }

    if (intensity === "light") {
      return [
        withSource({
          title: "Inspect receivers for receptive stigmas",
          due_offset_days: 2,
          risk_level: "medium",
          reason: `Light pollen shed observed on ${eventDate}. Receivers may be entering receptive window.`,
          next_steps: [
            'Log "stigmas_receptive" if stigmas are white and sticky',
            "Monitor daily for the next 3 days",
          ],
        }),
      ];
    }

    // missing / unrecognized
    return [
      withSource({
        title: "Inspect receivers for receptive stigmas",
        due_offset_days: 2,
        risk_level: "medium",
        reason: `Pollen shed observed on ${eventDate}. Receivers may be entering receptive window.`,
        next_steps: [
          'Log "stigmas_receptive" if stigmas are white and sticky',
          "Monitor daily for the next 3 days",
        ],
      }),
    ];
  }

  if (eventType === "reversal_application") {
    const suggestions: SuggestedAction[] = [];

    // Always the primary 9-day check
    suggestions.push(
      withSource({
        title: "Check donor for visible pollen shed",
        due_offset_days: 9,
        risk_level: "medium",
        reason: `Reversal applied on ${eventDate}. Typical visible pollen window is 7–12 days later.`,
        next_steps: [
          'Log "pollen_shed_observed" when pollen becomes visible',
          "Verify nearby receivers are still properly isolated",
        ],
      }),
    );

    const method = normalizeMethod(details.method);
    if (method === "sts_spray" || method === "colloidal_silver") {
      suggestions.push(
        withSource({
          title: "Confirm isolation status of nearby receivers",
          due_offset_days: 5,
          risk_level: "high",
          reason: "Chemical reversal methods can produce pollen earlier than expected.",
          next_steps: [
            "Inspect isolation barriers and airflow",
            "Consider extending isolation if any risk is observed",
          ],
        }),
      );
    }

    return suggestions;
  }

  if (eventType === "isolation_start") {
    return [
      withSource({
        title: "End isolation period for receivers",
        due_offset_days: 18,
        risk_level: "medium",
        reason: `Isolation started on ${eventDate}. Standard isolation window is 14–21 days.`,
        next_steps: [
          "Log an isolation end event or observation when moving plants back",
          "Inspect plants for any signs of stress before moving",
        ],
      }),
    ];
  }

  if (eventType === "pollination") {
    return [
      withSource({
        title: "Monitor seed development on receivers",
        due_offset_days: 12,
        risk_level: "low",
        reason:
          "Pollination performed. First visible seed development typically appears in 10–14 days.",
        next_steps: [
          "Take comparison photos every 7 days",
          "Log any abnormalities in observation events",
        ],
      }),
      withSource({
        title: "Prepare for cross harvest",
        due_offset_days: 40,
        risk_level: "low",
        reason:
          "Most cannabis seed crosses reach harvest readiness 35–50 days after successful pollination.",
        next_steps: [
          "Estimate expected seed count",
          "Prepare drying/curing space and labeling system",
        ],
      }),
    ];
  }

  if (eventType === "stigmas_receptive") {
    return [
      withSource({
        title: "Perform or confirm pollination",
        due_offset_days: 2,
        risk_level: "high",
        reason:
          "Stigmas observed as receptive. Optimal pollination window is narrow (usually 2–5 days).",
        next_steps: [
          'Log a "pollination" event with method and donor details',
          "Ensure donor pollen is viable and available",
        ],
      }),
    ];
  }

  if (eventType === "cross_harvest") {
    return [
      withSource({
        title: "Process and label new seed batch",
        due_offset_days: 1,
        risk_level: "low",
        reason:
          "Cross harvested. Proper labeling and initial viability assessment should happen promptly.",
        next_steps: [
          "Record estimated seed count and any observations",
          "Begin controlled drying process",
        ],
      }),
    ];
  }

  return [];
}
