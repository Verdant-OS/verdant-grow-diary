import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ScopedGrowBanner from "@/components/ScopedGrowBanner";
import GrowBreadcrumbs from "@/components/GrowBreadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useScopedGrow } from "@/hooks/useScopedGrow";
import { useAlertsList } from "@/hooks/useAlertsList";
import {
  acknowledgeAlert,
  dismissAlert,
  resolveAlert,
  type AlertSeverityRow,
  type AlertStatusRow,
} from "@/lib/alerts";
import { alertsPath } from "@/lib/routes";
import { formatDistanceToNow } from "date-fns";

type StatusFilter = AlertStatusRow | "all";
type SeverityFilter = AlertSeverityRow | "all";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

const SEVERITY_OPTIONS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "warning", label: "Warning" },
  { value: "watch", label: "Watch" },
  { value: "info", label: "Info" },
];

const SEVERITY_TONE: Record<AlertSeverityRow, string> = {
  critical: "border-destructive text-destructive",
  warning: "border-amber-500 text-amber-600",
  watch: "border-amber-400 text-amber-500",
  info: "border-muted-foreground text-muted-foreground",
};

const STATUS_TONE: Record<AlertStatusRow, string> = {
  open: "border-primary text-primary",
  acknowledged: "border-amber-500 text-amber-600",
  resolved: "border-emerald-500 text-emerald-600",
  dismissed: "border-muted-foreground text-muted-foreground",
};

export default function Alerts() {
  const { urlGrowId, scopedGrowName, isValidScopedGrow, backHref } =
    useScopedGrow();
  const scopedGrowId = isValidScopedGrow ? urlGrowId ?? undefined : undefined;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  const { status, alerts, error, reload } = useAlertsList({
    growId: scopedGrowId ?? null,
    status: statusFilter,
    severity: severityFilter,
  });

  const grouped = useMemo(() => {
    return {
      open: alerts.filter((a) => a.status === "open"),
      acknowledged: alerts.filter((a) => a.status === "acknowledged"),
      resolved: alerts.filter((a) => a.status === "resolved"),
      dismissed: alerts.filter((a) => a.status === "dismissed"),
    };
  }, [alerts]);

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeAlert(id);
      toast.success("Alert acknowledged");
      reload();
    } catch (e) {
      toast.error(`Failed to acknowledge: ${(e as Error).message}`);
    }
  };
  const handleResolve = async (id: string) => {
    try {
      await resolveAlert(id);
      toast.success("Alert resolved");
      reload();
    } catch (e) {
      toast.error(`Failed to resolve: ${(e as Error).message}`);
    }
  };
  const handleDismiss = async (id: string) => {
    try {
      await dismissAlert(id);
      toast.success("Alert dismissed");
      reload();
    } catch (e) {
      toast.error(`Failed to dismiss: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <GrowBreadcrumbs
        growId={urlGrowId}
        growName={scopedGrowName}
        current="Alerts"
        section="alerts"
      />
      <PageHeader
        title="Alert Center"
        description="Persistent environment alerts. Read-only insights — no automation."
        icon={<Bell className="h-5 w-5" />}
      />
      {urlGrowId && (
        <ScopedGrowBanner
          growId={urlGrowId}
          growName={scopedGrowName}
          label="alerts"
          clearHref={alertsPath()}
          backHref={backHref}
        />
      )}

      <div className="flex flex-wrap gap-2 mb-4">
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={severityFilter}
          onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {status === "loading" || status === "idle" ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : status === "unavailable" ? (
        <p className="text-sm text-muted-foreground">
          Alerts unavailable{error ? `: ${error}` : "."}
        </p>
      ) : alerts.length === 0 ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title="No alerts" />
      ) : (
        <div className="space-y-6">
          {(
            [
              { key: "open", label: "Open" },
              { key: "acknowledged", label: "Acknowledged" },
              { key: "resolved", label: "Resolved" },
              { key: "dismissed", label: "Dismissed" },
            ] as const
          ).map((group) => {
            const items = grouped[group.key];
            if (items.length === 0) return null;
            return (
              <section key={group.key} aria-label={`${group.label} alerts`}>
                <h2 className="font-display font-semibold text-sm mb-2">
                  {group.label}{" "}
                  <span className="text-xs text-muted-foreground">
                    {items.length}
                  </span>
                </h2>
                <ul className="space-y-2">
                  {items.map((a) => (
                    <li
                      key={a.id}
                      className="glass rounded-2xl p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${SEVERITY_TONE[a.severity]}`}
                        >
                          {a.severity}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase ${STATUS_TONE[a.status]}`}
                        >
                          {a.status}
                        </Badge>
                        <span className="text-sm font-medium">{a.title}</span>
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(a.first_seen_at), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {a.reason}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {a.status !== "acknowledged" &&
                          a.status !== "resolved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAcknowledge(a.id)}
                            >
                              Acknowledge
                            </Button>
                          )}
                        {a.status !== "resolved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleResolve(a.id)}
                          >
                            Resolve
                          </Button>
                        )}
                        {a.status !== "dismissed" &&
                          a.status !== "resolved" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDismiss(a.id)}
                            >
                              Dismiss
                            </Button>
                          )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
