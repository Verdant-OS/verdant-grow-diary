/**
 * OneTentSensorProofSection — read-only presenter that surfaces the
 * EcoWitt row-level + ingest-audit sensor proof inside the One-Tent
 * Live Proof page.
 *
 * Hard constraints:
 *  - Presenter only. No writes, no AI/model calls, no alerts, no Action
 *    Queue, no automation, no device control.
 *  - Consumes a sanitized view model; never renders raw payloads, secrets,
 *    tokens, bridge ids, owning auth ids, or internal identifiers.
 */
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type {
  OneTentSensorProofTone,
  OneTentSensorProofViewModel,
} from "@/lib/oneTentSensorProofViewModel";

function toneClass(tone: OneTentSensorProofTone): string {
  switch (tone) {
    case "ok":
      return "border-emerald-500/40 bg-emerald-500/5";
    case "warn":
      return "border-amber-500/40 bg-amber-500/5";
    case "neutral":
    default:
      return "border-border bg-muted/30";
  }
}

export default function OneTentSensorProofSection({
  vm,
}: {
  vm: OneTentSensorProofViewModel;
}) {
  return (
    <section
      data-testid="one-tent-sensor-proof-section"
      data-status={vm.sensorProofStatus}
      data-tone={vm.tone}
      className={`rounded-md border p-3 space-y-1.5 ${toneClass(vm.tone)}`}
      aria-label="Sensor proof"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Sensor proof</h3>
        <span
          className="text-[11px] text-muted-foreground"
          data-testid="one-tent-sensor-proof-window-label"
        >
          Proof window: {vm.proofWindowLabel}
        </span>
      </header>
      <p
        className="text-xs"
        data-testid="one-tent-sensor-proof-headline"
      >
        {vm.headline}
      </p>
      <p
        className="text-[11px] text-muted-foreground"
        data-testid="one-tent-sensor-proof-live-label"
      >
        {vm.liveRowProofLabel}
      </p>
      <p
        className="text-[11px] text-muted-foreground"
        data-testid="one-tent-sensor-proof-audit-label"
      >
        {vm.auditProofLabel}
      </p>
      {vm.limitations.length > 0 ? (
        <ul
          className="text-[11px] text-amber-700 dark:text-amber-300 list-disc pl-5"
          data-testid="one-tent-sensor-proof-limitations"
        >
          {vm.limitations.map((l) => (
            <li key={l.id} data-testid={`one-tent-sensor-proof-limitation-${l.id}`}>
              {l.text}
            </li>
          ))}
        </ul>
      ) : null}
      <div>
        <Button
          asChild
          size="sm"
          variant="outline"
          data-testid="one-tent-sensor-proof-operator-shortcut"
        >
          <Link to={vm.operatorShortcutHref}>{vm.operatorShortcutLabel}</Link>
        </Button>
      </div>
    </section>
  );
}
