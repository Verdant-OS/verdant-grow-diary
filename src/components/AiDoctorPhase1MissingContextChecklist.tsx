/**
 * AI Doctor Phase 1 — Missing-context checklist (read-only).
 *
 * Pure presenter. Computes per-item context readiness for the selected
 * plant from a compiled `AiDoctorContextPayload` and an optional derived
 * `missing_information` list. Never mutates data, never calls fetch /
 * Supabase / AI / device control, and never recommends nutrient,
 * irrigation, or equipment changes from weak evidence.
 *
 * Status rules:
 *  - "available" — explicit positive evidence (e.g. trustworthy live or
 *    manual sensor reading within freshness window).
 *  - "needs_review" — degraded evidence present (e.g. only stale /
 *    invalid telemetry, csv/demo only) — never classified as healthy.
 *  - "missing" — no usable evidence.
 *
 * Navigation CTAs reuse the same routes as `AiDoctorPhase1EmptyStateActions`
 * and only render when a safe plant-scoped route exists.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import type { AiDoctorContextPayload } from "@/lib/aiDoctorEnginePhase1Foundation";

export type AiDoctorPhase1ChecklistStatus =
  | "available"
  | "missing"
  | "needs_review";

export interface AiDoctorPhase1ChecklistCtaContext {
  plantId?: string | null;
  growId?: string | null;
  tentId?: string | null;
}

export interface AiDoctorPhase1ChecklistItem {
  id:
    | "recent_photo"
    | "recent_diary"
    | "fresh_sensor"
    | "watering_feeding"
    | "stage"
    | "medium"
    | "pot_size";
  label: string;
  status: AiDoctorPhase1ChecklistStatus;
  next_step: string;
  /** Optional navigation-only CTA. */
  cta?: { id: string; label: string; to: string } | null;
}

export interface AiDoctorPhase1MissingContextChecklistProps {
  context: AiDoctorContextPayload | null;
  /** Derived diagnosis result's missing_information, if any. */
  missing_information?: readonly string[];
  ctaContext: AiDoctorPhase1ChecklistCtaContext;
}

function ctaQuery(ctx: AiDoctorPhase1ChecklistCtaContext): string {
  const params = new URLSearchParams();
  if (ctx.plantId) params.set("plantId", ctx.plantId);
  if (ctx.growId) params.set("growId", ctx.growId);
  if (ctx.tentId) params.set("tentId", ctx.tentId);
  const s = params.toString();
  return s ? `?${s}` : "";
}

const TRUSTED_LIVE_SOURCES = new Set(["live", "manual"]);

function evaluateSensorStatus(
  context: AiDoctorContextPayload | null,
): AiDoctorPhase1ChecklistStatus {
  if (!context) return "missing";
  const summary = context.sensor_summary ?? [];
  if (summary.length === 0) return "missing";
  const hasTrustworthy = summary.some(
    (m) =>
      m.latest_source !== null &&
      TRUSTED_LIVE_SOURCES.has(m.latest_source) &&
      !m.is_stale &&
      !m.is_invalid,
  );
  if (hasTrustworthy) return "available";
  const hasDegraded = summary.some(
    (m) => m.latest_source !== null && (m.is_stale || m.is_invalid || m.is_degraded),
  );
  return hasDegraded ? "needs_review" : "missing";
}

export function buildAiDoctorPhase1Checklist(
  props: AiDoctorPhase1MissingContextChecklistProps,
): AiDoctorPhase1ChecklistItem[] {
  const ctx = props.context;
  const q = ctaQuery(props.ctaContext);
  const plantPath = props.ctaContext.plantId
    ? `/plants/${encodeURIComponent(props.ctaContext.plantId)}`
    : null;
  const addPhotoCta = plantPath
    ? { id: "add-photo", label: "Add Photo", to: `${plantPath}${q}` }
    : null;
  const addQuickLogCta = plantPath
    ? { id: "add-quick-log", label: "Add Quick Log", to: `${plantPath}${q}` }
    : null;
  const checkEnvCta = {
    id: "check-environment",
    label: "Check Environment",
    to: `/sensors${q}`,
  };
  const updatePlantCta = plantPath
    ? {
        id: "update-plant-context",
        label: "Update Plant Context",
        to: `${plantPath}${q}`,
      }
    : null;

  const photoCount = ctx?.recent_photos_count ?? 0;
  const recentLogs = ctx?.recent_logs ?? [];
  const wateringFeeding =
    (ctx?.recent_watering_events ?? 0) + (ctx?.recent_feeding_events ?? 0);
  const sensorStatus = evaluateSensorStatus(ctx);

  const items: AiDoctorPhase1ChecklistItem[] = [
    {
      id: "recent_photo",
      label: "Recent plant photo",
      status: photoCount > 0 ? "available" : "missing",
      next_step:
        photoCount > 0
          ? "A recent photo is available."
          : "Capture a recent photo so AI Doctor has visual context.",
      cta: photoCount > 0 ? null : addPhotoCta,
    },
    {
      id: "recent_diary",
      label: "Recent diary / Quick Log",
      status: recentLogs.length > 0 ? "available" : "missing",
      next_step:
        recentLogs.length > 0
          ? `Recent diary entries: ${recentLogs.length}.`
          : "Add a Quick Log so recent care is captured.",
      cta: recentLogs.length > 0 ? null : addQuickLogCta,
    },
    {
      id: "fresh_sensor",
      label: "Fresh sensor snapshot",
      status: sensorStatus,
      next_step:
        sensorStatus === "available"
          ? "Trustworthy live/manual sensor reading present."
          : sensorStatus === "needs_review"
            ? "Latest telemetry is stale or invalid — review before trusting."
            : "No recent sensor snapshot — add a manual snapshot or check the bridge.",
      cta: sensorStatus === "available" ? null : checkEnvCta,
    },
    {
      id: "watering_feeding",
      label: "Watering or feeding context",
      status: wateringFeeding > 0 ? "available" : "missing",
      next_step:
        wateringFeeding > 0
          ? `Recent watering+feeding events: ${wateringFeeding}.`
          : "Log watering or feeding so root-zone state is known.",
      cta: wateringFeeding > 0 ? null : addQuickLogCta,
    },
    {
      id: "stage",
      label: "Plant stage",
      status: ctx?.stage ? "available" : "missing",
      next_step: ctx?.stage
        ? `Stage: ${ctx.stage}.`
        : "Set the plant stage in plant context.",
      cta: ctx?.stage ? null : updatePlantCta,
    },
    {
      id: "medium",
      label: "Growing medium",
      status: ctx?.medium ? "available" : "missing",
      next_step: ctx?.medium
        ? `Medium: ${ctx.medium}.`
        : "Record the growing medium in plant context.",
      cta: ctx?.medium ? null : updatePlantCta,
    },
    {
      id: "pot_size",
      label: "Pot size",
      status: ctx?.pot_size ? "available" : "missing",
      next_step: ctx?.pot_size
        ? `Pot size: ${ctx.pot_size}.`
        : "Record the pot size in plant context.",
      cta: ctx?.pot_size ? null : updatePlantCta,
    },
  ];

  return items;
}

function statusCopy(status: AiDoctorPhase1ChecklistStatus): string {
  switch (status) {
    case "available":
      return "Available";
    case "needs_review":
      return "Needs review";
    case "missing":
    default:
      return "Missing";
  }
}

export function AiDoctorPhase1MissingContextChecklist(
  props: AiDoctorPhase1MissingContextChecklistProps,
): JSX.Element {
  const items = buildAiDoctorPhase1Checklist(props);
  return (
    <section
      data-testid="ai-doctor-phase1-missing-context-checklist"
      aria-label="AI Doctor context readiness"
      className="space-y-2 rounded-md border border-border bg-card p-4 text-sm"
    >
      <header className="space-y-0.5">
        <h2 className="text-base font-semibold text-foreground">
          Context readiness
        </h2>
        <p className="text-xs text-muted-foreground">
          Read-only checklist — no equipment is changed from this view.
        </p>
      </header>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid={`ai-doctor-phase1-checklist-item-${item.id}`}
            data-status={item.status}
            className="rounded border border-border bg-background p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-foreground">
                {item.label}
              </span>
              <span
                data-testid={`ai-doctor-phase1-checklist-status-${item.id}`}
                className="rounded border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {statusCopy(item.status)}
              </span>
            </div>
            <p
              data-testid={`ai-doctor-phase1-checklist-next-step-${item.id}`}
              className="text-xs text-muted-foreground"
            >
              {item.next_step}
            </p>
            {item.cta && (
              <Link
                to={item.cta.to}
                data-testid={`ai-doctor-phase1-checklist-cta-${item.id}-${item.cta.id}`}
                className="mt-1 inline-block rounded-md border border-border bg-secondary px-2 py-1 text-xs text-secondary-foreground"
              >
                {item.cta.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
