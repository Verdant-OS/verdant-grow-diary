/**
 * EcowittBridgeTroubleshootingPanel — presenter-only. Read-only.
 * Consumes the pure troubleshooting view model. Never displays tokens.
 */
import {
  buildTroubleshootingPanelViewModel,
  TROUBLESHOOTING_STATUS_LABEL,
} from "@/lib/ecowittBridgeTroubleshootingViewModel";
import type { TroubleshootingInput, TroubleshootingStatus } from "@/lib/ecowittBridgeTroubleshootingRules";

const STATUS_CLASS: Record<TroubleshootingStatus, string> = {
  ok: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  warn: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  error: "text-red-300 border-red-500/30 bg-red-500/10",
  unknown: "text-muted-foreground border-muted-foreground/30 bg-muted/20",
};

export interface EcowittBridgeTroubleshootingPanelProps {
  input: TroubleshootingInput;
  className?: string;
}

export default function EcowittBridgeTroubleshootingPanel({
  input,
  className,
}: EcowittBridgeTroubleshootingPanelProps) {
  const vm = buildTroubleshootingPanelViewModel(input);
  const noReadings = !input.lastReading;
  const tokenStatus = input.env?.bridgeTokenStatus ?? "unknown";
  const tentIdConfigured = input.env?.tentIdConfigured;
  return (
    <section
      data-testid="ecowitt-bridge-troubleshooting-panel"
      data-overall={vm.report.overall}
      className={["flex flex-col gap-3 p-3 border rounded-md bg-card", className]
        .filter(Boolean)
        .join(" ")}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">EcoWitt bridge troubleshooting</h3>
        <span
          data-testid="troubleshooting-overall"
          className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border ${STATUS_CLASS[vm.report.overall]}`}
        >
          {vm.overallLabel}
        </span>
      </header>
      <ul className="flex flex-col gap-1">
        {vm.report.checks.map((c) => (
          <li
            key={c.id}
            data-testid={`troubleshooting-check-${c.id}`}
            data-status={c.status}
            className="flex items-start justify-between gap-3 text-xs"
          >
            <span className="font-medium text-foreground/90">{c.label}</span>
            <span className="text-muted-foreground flex items-center gap-2">
              <span>{c.detail}</span>
              <span
                className={`inline-flex text-[10px] px-1.5 py-0.5 rounded border ${STATUS_CLASS[c.status]}`}
              >
                {TROUBLESHOOTING_STATUS_LABEL[c.status]}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div>
        <p className="text-[11px] text-muted-foreground mb-1">Next actions:</p>
        <ul className="text-[11px] text-muted-foreground space-y-0.5">
          {vm.report.nextActions.map((a) => (
            <li key={a.id} data-testid={`troubleshooting-action-${a.id}`}>
              • {a.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
