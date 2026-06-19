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
      {noReadings && (
        <div
          data-testid="troubleshooting-empty-no-readings"
          className="rounded border border-border/60 bg-muted/20 p-2 text-[11px] text-muted-foreground space-y-1"
        >
          <p className="text-foreground font-medium">No EcoWitt readings found yet.</p>
          <p>Run the dry-run command first, then send one webhook reading.</p>
          <p>Check MQTT Explorer for <span className="font-mono">ecowitt/#</span> before posting to Verdant.</p>
          <p>This panel does not start the bridge or verify local MQTT by itself.</p>
        </div>
      )}
      {tokenStatus === "unknown" && (
        <p
          data-testid="troubleshooting-token-unknown-note"
          className="text-[11px] text-amber-700 dark:text-amber-300"
        >
          Token status unknown — needs verification before being treated as healthy.
        </p>
      )}
      {tentIdConfigured === false && (
        <p
          data-testid="troubleshooting-missing-tent-id-note"
          className="text-[11px] text-amber-700 dark:text-amber-300"
        >
          Missing VERDANT_TENT_ID — set it locally before running the bridge.
        </p>
      )}
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
