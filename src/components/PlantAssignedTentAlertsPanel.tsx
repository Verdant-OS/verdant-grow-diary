/**
 * Render-only panel: open alerts for the plant's assigned tent.
 *
 * Reads from `public.alerts` via `useAlertsList` (RLS-scoped) and filters in
 * the pure rules layer. No writes. No action_queue handoff from this panel.
 * Recommendations are never invented — only fields already stored render.
 */
import { useEffect, useRef } from "react";
import { Link } from "@/lib/react-router-compat";
import {
  ArrowRight,
  Bell,
  AlertCircle,
  AlertTriangle,
  Gauge,
  Info,
  Eye,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { usePlantAssignedTentAlerts } from "@/hooks/usePlantAssignedTentAlerts";
import {
  resolveAlertFunnelMetric,
  type PlantAssignedTentAlertRow,
} from "@/lib/plantAssignedTentAlertRules";
import { alertsPath } from "@/lib/routes";
import { buildPlantAiDoctorReviewPath } from "@/lib/aiDoctorEntryRules";
import { buildPlantBlueprintPath } from "@/lib/plantDetailQuickActions";
import { resolveAlertBlueprintMetric } from "@/lib/alertBlueprintLinkRules";
import {
  ALERT_DOCTOR_CREDIT_GATE_SURFACE,
  type AlertDoctorCreditGateView,
} from "@/lib/alertDoctorCreditGateRules";
import { trackFunnelEvent } from "@/lib/funnelAnalytics";

interface Props {
  tentId: string | null | undefined;
  tentName?: string | null;
  growId: string | null | undefined;
  /**
   * When provided, each row offers an "Ask AI Doctor" shortcut into THIS
   * plant's cautious-review section. Optional so a caller that cannot prove
   * the alerts belong to the plant in view simply omits the shortcut rather
   * than pointing the grower at an unrelated plant.
   */
  plantId?: string | null;
  /**
   * Out-of-credits interception for the doctor CTA, computed by the CALLER
   * from presentation-only entitlement + usage reads (the panel itself
   * stays hook-free/presenter-only). When absent or intercept=false the
   * doctor CTA behaves exactly as before — callers that do not resolve
   * credit state simply omit it. Never gates access: the server-side
   * ai_credit_spend check remains the only spend authority.
   */
  doctorCreditGate?: AlertDoctorCreditGateView | null;
}

function severityClass(sev: PlantAssignedTentAlertRow["severity"]): string {
  switch (sev) {
    case "critical":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "warning":
      return "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30";
    case "watch":
      return "bg-[hsl(var(--info))]/15 text-[hsl(var(--info))] border-[hsl(var(--info))]/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function SeverityIcon({ sev }: { sev: PlantAssignedTentAlertRow["severity"] }) {
  if (sev === "critical") return <AlertCircle className="h-3 w-3" />;
  if (sev === "warning") return <AlertTriangle className="h-3 w-3" />;
  if (sev === "watch") return <Eye className="h-3 w-3" />;
  return <Info className="h-3 w-3" />;
}

function fmt(ts: string | null): string {
  if (!ts) return "";
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return "";
  return formatDistanceToNow(new Date(t), { addSuffix: true });
}

function AlertRowItem({
  row,
  plantId,
  tentId,
  creditGate,
}: {
  row: PlantAssignedTentAlertRow;
  plantId?: string | null;
  tentId?: string | null;
  creditGate?: AlertDoctorCreditGateView | null;
}) {
  // Deep-links into the plant's existing cautious-review section via the
  // shared helper (same href five other surfaces already use). Navigation
  // only — reaching the anchor never starts a review or spends a credit.
  const doctorHref = plantId ? buildPlantAiDoctorReviewPath({ plantId, tentId }) : null;
  // Reference navigation to the Blueprint targets for this alert's metric —
  // only when Blueprint actually bands that metric (soil-probe and snapshot
  // alerts have none). Deliberately NOT a causal claim: the persisted row
  // carries no source provenance, and an alert may have breached a CUSTOM
  // grow target while the same reading sits inside the SOP band — so the
  // label names the destination ("Stage Targets"), never "the band this
  // broke". Tier-agnostic and NOT an upsell: Craft growers land on their
  // live scoring, everyone else on the free targets preview; all entitlement
  // branching stays inside the Blueprint section itself.
  const bandHref =
    plantId && resolveAlertBlueprintMetric(row.metric) ? buildPlantBlueprintPath(plantId) : null;
  return (
    <li
      className="rounded-lg border bg-card/40 p-3 text-sm"
      data-testid="plant-assigned-tent-alert-row"
      data-alert-id={row.id}
      data-severity={row.severity}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass(row.severity)}`}
            data-testid="plant-assigned-tent-alert-severity"
          >
            <SeverityIcon sev={row.severity} />
            {row.severityLabel}
          </span>
          {row.metric ? (
            <Badge
              variant="outline"
              className="capitalize"
              data-testid="plant-assigned-tent-alert-metric"
            >
              {row.metric}
            </Badge>
          ) : null}
          <Badge
            variant="secondary"
            className="capitalize"
            data-testid="plant-assigned-tent-alert-status"
          >
            {row.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {doctorHref && creditGate?.intercept ? (
            // Honest interception: this grow's free AI Doctor allotment is
            // spent, so the review section could only show the server-side
            // quota denial. The row action routes to plans instead; the
            // reason renders once at panel level (credits note) and in this
            // link's title. Impression (paywall_viewed) also fires at panel
            // level, deduped — never per row.
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              data-testid="plant-assigned-tent-alert-doctor-plans"
            >
              <Link
                to={creditGate.href}
                title={creditGate.note}
                onClick={() =>
                  // Id-free by construction: a fixed surface token only.
                  trackFunnelEvent("paywall_cta_clicked", {
                    surface: ALERT_DOCTOR_CREDIT_GATE_SURFACE,
                  })
                }
              >
                <Sparkles className="h-3.5 w-3.5" /> {creditGate.ctaLabel}
              </Link>
            </Button>
          ) : doctorHref ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              data-testid="plant-assigned-tent-alert-ask-doctor"
            >
              <Link
                to={doctorHref}
                onClick={() =>
                  // Same funnel sink and privacy contract as the Stage
                  // Targets click below: severity bucket + fixed metric token
                  // only, never an id. Unlike that link, this CTA renders for
                  // EVERY alert row, so the metric passes through the closed
                  // persisted-vocabulary allowlist instead of relying on the
                  // Blueprint-mapping render gate.
                  trackFunnelEvent("alert_doctor_cta_clicked", {
                    surface: "tent_alert_row",
                    metric: resolveAlertFunnelMetric(row.metric) ?? undefined,
                    severity: row.severity,
                  })
                }
              >
                <Sparkles className="h-3.5 w-3.5" /> Ask AI Doctor
              </Link>
            </Button>
          ) : null}
          {bandHref ? (
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              data-testid="plant-assigned-tent-alert-target-band"
            >
              <Link
                to={bandHref}
                onClick={() =>
                  // Same privacy contract as the doctor CTA above: severity
                  // bucket + fixed metric token only, never an id. The link is
                  // gated on the alert→Blueprint mapping, so row.metric here
                  // can only be a mapped vocabulary token.
                  trackFunnelEvent("blueprint_cta_clicked", {
                    surface: "tent_alert_row",
                    metric: row.metric ?? undefined,
                    severity: row.severity,
                  })
                }
              >
                <Gauge className="h-3.5 w-3.5" /> Stage Targets
              </Link>
            </Button>
          ) : null}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1"
            data-testid="plant-assigned-tent-alert-view"
          >
            <Link to={`/alerts/${row.id}`}>
              View Alert <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
      <p className="mt-2 font-medium leading-snug">{row.title}</p>
      {row.reason ? (
        <p className="mt-1 text-xs text-muted-foreground leading-snug">{row.reason}</p>
      ) : null}
      {row.lastSeenAt ? (
        <p
          className="mt-1 text-[11px] text-muted-foreground"
          data-testid="plant-assigned-tent-alert-timestamp"
        >
          Last seen {fmt(row.lastSeenAt)}
        </p>
      ) : null}
    </li>
  );
}

export default function PlantAssignedTentAlertsPanel({
  tentId,
  tentName,
  growId,
  plantId,
  doctorCreditGate,
}: Props) {
  const enabled = !!tentId;
  const { status, rows } = usePlantAssignedTentAlerts(tentId ?? null, growId ?? null);

  // The credits note (and the swapped row CTAs it explains) only exist when
  // the caller resolved an exhausted free allotment AND alert rows actually
  // render — the same condition gates the paywall impression below, so the
  // impression can never be broader than what the grower saw.
  const showCreditsNote =
    doctorCreditGate?.intercept === true && enabled && status === "ready" && rows.length > 0;

  // One impression per mount, only when the gated state actually rendered.
  const paywallTrackedRef = useRef(false);
  useEffect(() => {
    if (!showCreditsNote || paywallTrackedRef.current) return;
    paywallTrackedRef.current = true;
    trackFunnelEvent("paywall_viewed", { surface: ALERT_DOCTOR_CREDIT_GATE_SURFACE });
  }, [showCreditsNote]);

  return (
    <Card data-testid="plant-assigned-tent-alerts-panel" className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" /> Tent Alerts
          {tentName ? (
            <span className="text-xs font-normal text-muted-foreground">· {tentName}</span>
          ) : null}
        </CardTitle>
        {enabled ? (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1"
            data-testid="plant-assigned-tent-alerts-open-alerts"
          >
            <Link to={alertsPath()}>
              Open Alerts <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="text-sm">
        {!enabled ? (
          <p
            className="text-muted-foreground"
            data-testid="plant-assigned-tent-alerts-empty-no-tent"
          >
            Assign this plant to a tent to see tent alerts.
          </p>
        ) : status === "loading" || status === "idle" ? (
          <p className="text-muted-foreground">Loading tent alerts…</p>
        ) : status === "unavailable" ? (
          <p className="text-muted-foreground" data-testid="plant-assigned-tent-alerts-unavailable">
            Tent alerts are temporarily unavailable.
          </p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground" data-testid="plant-assigned-tent-alerts-empty">
            No open alerts for this assigned tent.
          </p>
        ) : (
          <>
            {showCreditsNote ? (
              <p
                className="mb-2 text-xs text-muted-foreground"
                data-testid="plant-assigned-tent-alerts-credits-note"
              >
                {doctorCreditGate!.note}
              </p>
            ) : null}
            <ul className="space-y-2" data-testid="plant-assigned-tent-alerts-list">
              {rows.map((r) => (
                <AlertRowItem
                  key={r.id}
                  row={r}
                  plantId={plantId ?? null}
                  tentId={tentId ?? null}
                  creditGate={doctorCreditGate ?? null}
                />
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
