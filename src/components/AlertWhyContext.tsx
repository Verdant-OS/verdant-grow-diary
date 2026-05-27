/**
 * Read-only presenter for the stage-aware "Why this alert?" affordance.
 *
 * - No I/O. No Supabase. No state. No mutations.
 * - Two variants: compact (Alerts list) and detailed (Alert Detail).
 * - Derivation lives in `@/lib/alertWhyContext` — this file only renders.
 */
import { deriveAlertWhyContext, WHY_PREFIX, type AlertLike } from "@/lib/alertWhyContext";

export interface AlertWhyContextProps {
  alert: AlertLike;
  variant?: "compact" | "detailed";
}

export function AlertWhyContext({ alert, variant = "compact" }: AlertWhyContextProps) {
  const why = deriveAlertWhyContext(alert);

  if (variant === "compact") {
    return (
      <p
        data-testid="alert-why-compact"
        data-kind={why.kind}
        className="text-[11px] text-muted-foreground/90"
      >
        <span className="font-medium">{WHY_PREFIX}</span>{" "}
        <span>{why.text}</span>
      </p>
    );
  }

  return (
    <div
      data-testid="alert-why-detailed"
      data-kind={why.kind}
      className="rounded-lg border border-border/40 bg-secondary/20 p-3 text-xs"
    >
      <p className="font-medium">{WHY_PREFIX}</p>
      <p className="mt-1 text-muted-foreground">{why.text}</p>
      {why.kind === "stage" ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <dt className="uppercase tracking-wider">Stage</dt>
          <dd data-testid="alert-why-stage">{why.stageLabel}</dd>
          <dt className="uppercase tracking-wider">Target range</dt>
          <dd data-testid="alert-why-range">
            {why.metric === "vpd"
              ? `${why.min.toFixed(1)}–${why.max.toFixed(1)} ${why.unit}`
              : `${why.min}–${why.max}${why.unit}`}
          </dd>
        </dl>
      ) : null}
    </div>
  );
}
