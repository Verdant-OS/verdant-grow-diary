/**
 * EcowittLiveProofPanel — read-only presenter for the EcoWitt Live Ingest
 * Proof Gate.
 *
 * Hard constraints:
 *  - Presenter only. No writes, no AI calls, no alerts, no Action Queue,
 *    no automation, no device control, no raw payload rendering.
 *  - Consumes rows via props so this panel can be wired to any RLS-safe
 *    loader (e.g. the existing `useEcowittLatestSnapshot` query path).
 *  - Counts and copy are derived from the pure view model — never assumed.
 */
import {
  buildEcowittLiveProofViewModel,
  type EcowittLiveProofViewModel,
} from "@/lib/ecowittLiveProofViewModel";
import type { EcowittProofRow } from "@/lib/ecowittLiveProofRules";

export interface EcowittLiveProofPanelProps {
  tentId: string | null | undefined;
  rows: readonly EcowittProofRow[] | null | undefined;
  /** Injectable now for deterministic tests. */
  now?: Date;
}

function toneClass(tone: EcowittLiveProofViewModel["tone"]): string {
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

export function EcowittLiveProofPanel(
  props: EcowittLiveProofPanelProps,
): JSX.Element {
  const vm = buildEcowittLiveProofViewModel(props.rows, {
    tentId: props.tentId,
    now: props.now,
  });

  return (
    <section
      data-testid="ecowitt-live-proof-panel"
      data-tone={vm.tone}
      data-status={vm.candidateStatus ?? "empty"}
      data-legacy-bridge={vm.isLegacyBridgeSource ? "true" : "false"}
      className={`rounded-md border p-4 ${toneClass(vm.tone)}`}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{vm.headline}</h3>
        <span
          className="text-xs text-muted-foreground"
          data-testid="ecowitt-live-proof-window-label"
        >
          Proof window: {vm.windowLabel}
        </span>
      </header>

      {vm.detail ? (
        <p
          className="mt-2 text-xs text-muted-foreground"
          data-testid="ecowitt-live-proof-detail"
        >
          {vm.detail}
        </p>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Accepted</dt>
          <dd
            className="font-mono text-base"
            data-testid="ecowitt-live-proof-accepted"
          >
            {vm.acceptedCount}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Rejected</dt>
          <dd
            className="font-mono text-base"
            data-testid="ecowitt-live-proof-rejected"
          >
            {vm.rejectedCount}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {vm.acceptedCount} accepted / {vm.rejectedCount} rejected in the current
        proof window ({vm.windowLabel}).
      </p>

      {vm.candidateMetricLabels.length > 0 ? (
        <ul
          className="mt-3 flex flex-wrap gap-1.5"
          data-testid="ecowitt-live-proof-metric-labels"
        >
          {vm.candidateMetricLabels.map((label) => (
            <li
              key={label}
              className="rounded-sm border border-border bg-background px-2 py-0.5 text-[11px]"
            >
              {label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default EcowittLiveProofPanel;
