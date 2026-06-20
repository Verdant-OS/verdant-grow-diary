/**
 * TimelineEvidenceDetailDrawer — read-only evidence drawer for a
 * Timeline entry. Pure presenter on top of the view-model helper.
 *
 * No DB writes, no fetches, no AI calls, no Action Queue / alert /
 * sensor / device side effects. The "Useful for AI Doctor context"
 * line is a static hint string — it does NOT trigger AI.
 */
import { useEffect, useRef } from "react";
import { X, Camera, Gauge, FileText, Droplets, FlaskConical, Leaf, Sprout, Clock } from "lucide-react";
import type { TimelineEvidenceDetailViewModel } from "@/lib/timelineEvidenceDetailViewModel";
import TimelineSensorSourceBadge from "@/components/TimelineSensorSourceBadge";
import { classifyTimelineSensorSource } from "@/lib/timelineSensorSourceBadgeRules";
import SensorSourceLegendTooltip from "@/components/SensorSourceLegendTooltip";

interface Props {
  viewModel: TimelineEvidenceDetailViewModel | null;
  open: boolean;
  onClose: () => void;
}

export default function TimelineEvidenceDetailDrawer({ viewModel, open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && closeRef.current) closeRef.current.focus();
  }, [open]);

  if (!open || !viewModel) return null;

  const vm = viewModel;

  const contextTone =
    vm.contextHint.level === "strong"
      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
      : vm.contextHint.level === "limited"
        ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
        : "bg-cyan-500/10 border-cyan-500/30 text-cyan-300";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Timeline entry details"
      data-testid="timeline-evidence-drawer"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto p-5 border border-border/50">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close entry details"
          data-testid="timeline-evidence-drawer-close"
          className="absolute top-3 right-3 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <X className="h-4 w-4" />
        </button>

        <header className="mb-4 pr-8">
          <h2 className="text-lg font-display font-semibold" data-testid="timeline-evidence-drawer-title">
            {vm.title}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5" data-testid="timeline-evidence-drawer-subtitle">
            {vm.subtitle}
          </p>
          {vm.occurredAt && (
            <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {vm.occurredAt}
            </p>
          )}
        </header>

        <section
          className={`rounded-xl border px-3 py-2 text-xs mb-4 ${contextTone}`}
          data-testid="timeline-evidence-drawer-context"
          aria-label="AI Doctor context hint"
        >
          <p className="font-medium">{vm.contextHint.label}</p>
          <p className="opacity-80 mt-0.5">{vm.contextHint.description}</p>
        </section>

        <div className="flex flex-wrap gap-1.5 mb-4" data-testid="timeline-evidence-drawer-badges">
          {vm.badges.includes("photo") && <Chip icon={<Camera className="h-3 w-3" />}>Photo</Chip>}
          {vm.badges.includes("sensor") && <Chip icon={<Gauge className="h-3 w-3" />}>Sensor snapshot</Chip>}
          {vm.badges.includes("note") && <Chip icon={<FileText className="h-3 w-3" />}>Note</Chip>}
          {vm.badges.includes("watering") && <Chip icon={<Droplets className="h-3 w-3" />}>Watering</Chip>}
          {vm.badges.includes("feeding") && <Chip icon={<FlaskConical className="h-3 w-3" />}>Feeding</Chip>}
          {vm.badges.includes("maturity_evidence") && <Chip icon={<Leaf className="h-3 w-3" />}>Maturity evidence</Chip>}
          {vm.badges.includes("stale_sensor") && (
            <Chip icon={<Clock className="h-3 w-3" />} tone="warn">Stale snapshot</Chip>
          )}
        </div>

        {vm.sourceLabels.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Source</p>
            <div className="flex flex-wrap gap-1.5" data-testid="timeline-evidence-drawer-sources">
              {vm.sourceLabels.map((s) => (
                <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-secondary/60 border border-border/40">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs mb-4">
          <Row label="Event type" value={vm.eventTypeLabel} />
          {vm.stageLabel && <Row label="Stage" value={vm.stageLabel} icon={<Sprout className="h-3 w-3" />} />}
          {vm.plantLabel && <Row label="Plant" value={vm.plantLabel} icon={<Leaf className="h-3 w-3" />} />}
          {vm.tentLabel && <Row label="Tent" value={vm.tentLabel} />}
          {vm.remindAt && <Row label="Reminder" value={vm.remindAt} />}
        </dl>

        {vm.note.trim() && (
          <section className="mb-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Note</p>
            <p
              className="text-sm whitespace-pre-wrap rounded-lg bg-secondary/30 border border-border/40 p-3"
              data-testid="timeline-evidence-drawer-note"
            >
              {vm.note}
            </p>
          </section>
        )}

        {vm.maturityEvidence && (
          <section className="mb-4" data-testid="timeline-maturity-evidence">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
              Maturity evidence
            </p>
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-xs text-violet-200">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {vm.maturityEvidence.clearPct != null && <Chip tone="maturity">Clear {vm.maturityEvidence.clearPct}%</Chip>}
                {vm.maturityEvidence.cloudyPct != null && <Chip tone="maturity">Cloudy {vm.maturityEvidence.cloudyPct}%</Chip>}
                {vm.maturityEvidence.amberPct != null && <Chip tone="maturity">Amber {vm.maturityEvidence.amberPct}%</Chip>}
              </div>
              {vm.maturityEvidence.observedAt && (
                <p className="mb-2 text-[11px] text-violet-100/80">
                  Observed {vm.maturityEvidence.observedAt}
                </p>
              )}
              {vm.maturityEvidence.advisoryOnly && (
                <p className="mb-2 text-[11px] text-violet-100/90" data-testid="timeline-maturity-advisory">
                  Evidence only — grower decides.
                </p>
              )}
              {vm.maturityEvidence.notes.length > 0 && (
                <ul className="space-y-1 text-[11px]">
                  {vm.maturityEvidence.notes.map((n) => (
                    <li key={n.label}>
                      <span className="font-medium text-violet-100">{n.label}:</span> {n.value}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {vm.sensor && (() => {
          // Canonical source badge. If the entry has sensor-derived
          // evidence and no trusted source, this renders "invalid",
          // not "live".
          const sourceBadge = classifyTimelineSensorSource({
            rawSource: vm.sensor.source === "unknown" ? null : vm.sensor.source,
            capturedAt: vm.sensor.capturedAt,
            // Detail view does not assume manual fallback — unknown
            // sources must be flagged as invalid.
            fallback: "invalid",
          });
          return (
            <section className="mb-4" data-testid="timeline-evidence-drawer-sensor">
              <div className="mb-1 flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sensor snapshot</p>
                <SensorSourceLegendTooltip testIdSuffix="drawer" />
              </div>
              <div className="mb-1.5">
                <TimelineSensorSourceBadge
                  badge={sourceBadge}
                  className="mr-1"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {vm.sensor.tempC != null && <Chip>{vm.sensor.tempC}°C</Chip>}
                {vm.sensor.rhPercent != null && <Chip>{vm.sensor.rhPercent}% RH</Chip>}
                {vm.sensor.vpdKpa != null && <Chip>VPD {vm.sensor.vpdKpa}</Chip>}
                {vm.sensor.co2Ppm != null && <Chip>CO₂ {vm.sensor.co2Ppm}</Chip>}
                {vm.sensor.soilPercent != null && <Chip>Soil {vm.sensor.soilPercent}%</Chip>}
              </div>
              {vm.sensor.capturedAt && (
                <p className="text-[11px] text-muted-foreground mt-1">Captured {vm.sensor.capturedAt}</p>
              )}
            </section>
          );
        })()}

        {(vm.watering || vm.feeding) && (
          <section className="mb-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Care</p>
            <div className="flex flex-wrap gap-1.5">
              {vm.watering?.volumeMl != null && <Chip>Water {vm.watering.volumeMl} ml</Chip>}
              {vm.feeding?.ec != null && <Chip>EC {vm.feeding.ec}</Chip>}
              {vm.feeding?.ph != null && <Chip>pH {vm.feeding.ph}</Chip>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  icon,
  tone,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "warn" | "maturity";
}) {
  const cls =
    tone === "warn"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
      : tone === "maturity"
        ? "bg-violet-500/10 border-violet-500/30 text-violet-100"
        : "bg-secondary/60 border-border/40";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>
      {icon}
      {children}
    </span>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="inline-flex items-center gap-1">{icon}{value}</dd>
    </>
  );
}
