/**
 * AI Doctor Phase 1 — Empty / Missing-Context CTA buttons (navigation-only).
 *
 * Renders read-only navigation CTAs (React Router <Link>) that route the
 * operator to existing safe screens to gather more evidence. No mutations,
 * no fetch, no Supabase writes, no AI calls, no device control. All CTAs
 * carry the current plantId / growId / tentId as query params when present.
 */
import * as React from "react";
import { Link } from "react-router-dom";

export interface AiDoctorPhase1CtaContext {
  plantId?: string | null;
  growId?: string | null;
  tentId?: string | null;
}

export interface AiDoctorPhase1EmptyStateActionsProps {
  /** Which empty state to render CTAs for. */
  kind: "no-result" | "missing-context";
  /** Missing-context items (used when kind === "missing-context"). */
  missing?: readonly string[];
  context: AiDoctorPhase1CtaContext;
}

function ctaQuery(ctx: AiDoctorPhase1CtaContext): string {
  const params = new URLSearchParams();
  if (ctx.plantId) params.set("plantId", ctx.plantId);
  if (ctx.growId) params.set("growId", ctx.growId);
  if (ctx.tentId) params.set("tentId", ctx.tentId);
  const s = params.toString();
  return s ? `?${s}` : "";
}

interface CtaSpec {
  id: string;
  label: string;
  to: string;
}

export function deriveMissingContextCtas(
  missing: readonly string[],
  ctx: AiDoctorPhase1CtaContext,
): CtaSpec[] {
  const q = ctaQuery(ctx);
  const plantPath = ctx.plantId ? `/plants/${ctx.plantId}` : "/plants";
  const out: CtaSpec[] = [];
  const haystack = missing.join(" | ").toLowerCase();
  if (haystack.includes("photo")) {
    out.push({ id: "add-photo", label: "Add Photo", to: `${plantPath}${q}` });
  }
  if (haystack.includes("watering") || haystack.includes("feeding") || haystack.includes("diary")) {
    out.push({ id: "add-quick-log", label: "Add Quick Log", to: `${plantPath}${q}` });
  }
  if (haystack.includes("sensor") || haystack.includes("snapshot") || haystack.includes("reading")) {
    out.push({ id: "check-environment", label: "Check Environment", to: `/sensors${q}` });
  }
  if (
    haystack.includes("stage") ||
    haystack.includes("medium") ||
    haystack.includes("pot")
  ) {
    out.push({ id: "update-plant-context", label: "Update Plant Context", to: `${plantPath}${q}` });
  }
  return out;
}

function noResultCtas(ctx: AiDoctorPhase1CtaContext): CtaSpec[] {
  const q = ctaQuery(ctx);
  const plantPath = ctx.plantId ? `/plants/${ctx.plantId}` : "/plants";
  return [
    { id: "add-quick-log", label: "Add Quick Log", to: `${plantPath}${q}` },
    { id: "add-photo", label: "Add Photo", to: `${plantPath}${q}` },
    { id: "check-environment", label: "Check Environment", to: `/sensors${q}` },
  ];
}

export function AiDoctorPhase1EmptyStateActions(
  props: AiDoctorPhase1EmptyStateActionsProps,
): JSX.Element {
  const ctas =
    props.kind === "no-result"
      ? noResultCtas(props.context)
      : deriveMissingContextCtas(props.missing ?? [], props.context);

  if (ctas.length === 0) return <></>;

  return (
    <div
      data-testid={`ai-doctor-phase1-empty-state-actions-${props.kind}`}
      className="mt-3 flex flex-wrap gap-2"
    >
      {ctas.map((cta) => (
        <Link
          key={cta.id}
          to={cta.to}
          data-testid={`ai-doctor-phase1-cta-${cta.id}`}
          className="rounded-md border border-border bg-secondary px-3 py-1 text-xs text-secondary-foreground"
        >
          {cta.label}
        </Link>
      ))}
    </div>
  );
}
