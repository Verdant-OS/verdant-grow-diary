/**
 * hyperLogDraftRules — pure mapping from HyperLogModal demo draft to the
 * existing Quick Log prefill / open-quicklog event payload.
 *
 * Hard constraints:
 *   - No I/O. No Supabase / write / AI / Action Queue imports.
 *   - Never throws. Untrusted inputs.
 *   - Does NOT carry HyperLog's hardcoded demo sensor snapshot values
 *     (24.6°C / 58% / 1.12 kPa) into the Quick Log prefill. Sensor
 *     attachment happens through the real Quick Log sensor strip, never
 *     via HyperLog demo numbers.
 *   - Does NOT transfer locally-previewed HyperLog photos. Those remain
 *     in the modal as local object URLs.
 */
import type { HyperLogAction, HyperLogDemoFormState } from "@/components/HyperLogModal";
import type { QuickLogPrefill } from "@/components/QuickLog";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

export type QuickLogEventType =
  | "observation"
  | "watering"
  | "feeding"
  | "training"
  | "photo"
  | "environment"
  | "harvest";

export interface HyperLogPlantContext {
  plantId: string | null;
  plantName?: string | null;
  growId: string | null;
  tentId: string | null;
  tentName?: string | null;
}

export interface BuildHyperLogPrefillInput {
  action: HyperLogAction;
  form: HyperLogDemoFormState;
  context?: HyperLogPlantContext | null;
  /** Optional photo count from local previews — surfaced as note hint only. */
  photoCount?: number;
}

/** Map a HyperLog action to the existing Quick Log event_type. */
export function mapHyperLogActionToEventType(
  action: HyperLogAction,
): QuickLogEventType {
  switch (action) {
    case "water":
      return "watering";
    case "feed":
      return "feeding";
    case "defoliate":
      // Defoliation is a canopy training action in the existing taxonomy.
      return "training";
    case "environment":
      return "environment";
    case "note":
    default:
      return "observation";
  }
}

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Compose a human-readable note from the HyperLog demo form. Returns an
 * empty string when nothing meaningful was entered — callers should drop
 * empty notes rather than send them.
 */
export function composeHyperLogNote(
  action: HyperLogAction,
  form: HyperLogDemoFormState,
  photoCount = 0,
): string {
  const parts: string[] = [];
  if (action === "water") {
    const amt = trim(form.waterAmount);
    const unit = trim(form.waterUnit) || "ml";
    if (amt) parts.push(`Watered ${amt} ${unit}`.trim());
    const n = trim(form.waterNote);
    if (n) parts.push(n);
  } else if (action === "feed") {
    const amt = trim(form.feedAmount);
    const nute = trim(form.feedNutrient);
    if (amt || nute) {
      const head = amt ? `Fed ${amt}` : "Fed";
      parts.push(nute ? `${head} (${nute})` : head);
    }
    const n = trim(form.feedNote);
    if (n) parts.push(n);
  } else if (action === "defoliate") {
    const intensity = trim(form.defoliateIntensity);
    parts.push(intensity ? `Defoliated — ${intensity}` : "Defoliated");
    const n = trim(form.defoliateNote);
    if (n) parts.push(n);
  } else if (action === "environment") {
    const sub: string[] = [];
    const t = trim(form.envTemp);
    const h = trim(form.envHumidity);
    const v = trim(form.envVpd);
    const c = trim(form.envCo2);
    if (t) sub.push(`Temp ${t}°C`);
    if (h) sub.push(`RH ${h}%`);
    if (v) sub.push(`VPD ${v} kPa`);
    if (c) sub.push(`CO2 ${c} ppm`);
    if (sub.length > 0) parts.push(`Env check — ${sub.join(", ")}`);
    else parts.push("Env check");
    const n = trim(form.envNote);
    if (n) parts.push(n);
  } else {
    const n = trim(form.freeformNote);
    if (n) parts.push(n);
  }
  if (photoCount > 0) {
    parts.push(
      `(${photoCount} HyperLog photo${photoCount === 1 ? "" : "s"} kept locally — re-attach in Quick Log if needed.)`,
    );
  }
  return parts.join(" · ").trim();
}

/**
 * Build the Quick Log prefill payload for the existing
 * `verdant:open-quicklog` event from a HyperLog draft.
 *
 * Safe against null/undefined inputs. Never throws.
 */
export function buildHyperLogQuickLogPrefill(
  input: BuildHyperLogPrefillInput,
): QuickLogPrefill | null {
  try {
    if (!input || !input.action || !input.form) return null;
    const ctx = input.context ?? null;
    const eventType = mapHyperLogActionToEventType(input.action);
    const photoCount = Math.max(0, Math.floor(Number(input.photoCount ?? 0))) || 0;
    const note = composeHyperLogNote(input.action, input.form, photoCount);
    const prefill: QuickLogPrefill = {
      plantId: ctx?.plantId ?? null,
      plantName: ctx?.plantName ?? null,
      growId: ctx?.growId ?? null,
      tentId: ctx?.tentId ?? null,
      eventType,
      suggestSnapshot: Boolean(ctx?.tentId),
      note: note || null,
      source: "hyperlog",
      photoCount,
    };
    return prefill;
  } catch {
    return null;
  }
}

export const HYPERLOG_QUICKLOG_EVENT_NAME = PLANT_QUICKLOG_PREFILL_EVENT;
