/**
 * Read-only presenter for tent/plant target context on alert list + detail.
 *
 * Derivation lives in `@/lib/alertTargetContextRules`. This file only renders.
 * Optional hrefs keep grow/tent/plant routing in the page (list stays unlinked).
 */
import { Link } from "@/lib/react-router-compat";
import {
  ALERT_TARGET_HISTORICAL_BADGE,
  ALERT_TARGET_HISTORICAL_NOTE,
  ALERT_TARGET_PREFIX,
  deriveAlertTargetContext,
  type AlertTargetContextInput,
} from "@/lib/alertTargetContextRules";

const ALERT_TARGET_UNAVAILABLE_FIELD = "Unavailable";

export interface AlertTargetContextProps extends AlertTargetContextInput {
  variant?: "compact" | "detailed";
  tentHref?: string | null;
  plantHref?: string | null;
}

function TargetValue({
  href,
  label,
  testId,
}: {
  href: string | null | undefined;
  label: string;
  testId: string;
}) {
  if (href) {
    return (
      <Link to={href} className="text-primary hover:underline" data-testid={testId}>
        {label}
      </Link>
    );
  }
  return <span data-testid={testId}>{label}</span>;
}

export function AlertTargetContext({
  tentId,
  plantId,
  tentName,
  plantName,
  namesLoading,
  idsLoading,
  linkedEvidence,
  singleTentId,
  tentState,
  plantState,
  variant = "compact",
  tentHref,
  plantHref,
}: AlertTargetContextProps) {
  const target = deriveAlertTargetContext({
    tentId,
    plantId,
    tentName,
    plantName,
    namesLoading,
    idsLoading,
    linkedEvidence,
    singleTentId,
    tentState,
    plantState,
  });

  const historicalNote = target.historical ? (
    <p data-testid="alert-target-historical-note" className="text-[11px] text-muted-foreground">
      <span className="mr-1 rounded border border-border/60 px-1 py-px font-medium uppercase tracking-wider">
        {ALERT_TARGET_HISTORICAL_BADGE}
      </span>
      {ALERT_TARGET_HISTORICAL_NOTE}
    </p>
  ) : null;

  if (variant === "compact") {
    return (
      <>
        <p
          data-testid="alert-target-compact"
          data-kind={target.kind}
          data-historical={target.historical ? "true" : "false"}
          className="text-[11px] text-muted-foreground/90"
        >
          <span className="font-medium">{ALERT_TARGET_PREFIX}</span> <span>{target.text}</span>
        </p>
        {historicalNote}
      </>
    );
  }

  const tentDisplay = target.tentValue ?? ALERT_TARGET_UNAVAILABLE_FIELD;
  const plantDisplay = target.plantValue ?? ALERT_TARGET_UNAVAILABLE_FIELD;

  return (
    <div
      data-testid="alert-target-detailed"
      data-kind={target.kind}
      data-historical={target.historical ? "true" : "false"}
      className="contents"
    >
      <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
        <dt className="uppercase tracking-wider text-muted-foreground">Tent</dt>
        <dd className="font-medium">
          <TargetValue
            href={target.tentState === "missing" ? null : tentHref}
            label={tentDisplay}
            testId="alert-detail-tent-label"
          />
        </dd>
      </div>
      <div className="rounded-lg border border-border/40 bg-secondary/20 p-2">
        <dt className="uppercase tracking-wider text-muted-foreground">Plant</dt>
        <dd className="font-medium">
          <TargetValue
            href={target.plantState === "missing" ? null : plantHref}
            label={plantDisplay}
            testId="alert-detail-plant-label"
          />
        </dd>
      </div>
      {historicalNote ? (
        <div className="sm:col-span-2">
          <dt className="sr-only">Target status</dt>
          <dd>{historicalNote}</dd>
        </div>
      ) : null}
    </div>
  );
}
