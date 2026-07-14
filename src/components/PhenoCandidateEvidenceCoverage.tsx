/**
 * PhenoCandidateEvidenceCoverage — presenter for one candidate's manual
 * evidence packet (configured-goal coverage from Quick Log receipts).
 *
 * Renders the pure packet verbatim; derives nothing in JSX. This is a
 * SEPARATE row from the structured readiness badge — coverage of configured
 * goals is not readiness and is never presented as a score, rank, or
 * recommendation. States are text-labeled (never color-only).
 *
 * "Record <goal> evidence" dispatches the EXISTING global Quick Log prefill
 * event with the exact goal the grower clicked — no new modal/route/save.
 */
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import {
  buildPhenoEvidenceGoalQuickLogPrefill,
  type PhenoEvidenceGoalQuickLogPrefillInput,
} from "@/lib/phenoEvidenceQuickLogPrefill";
import {
  phenoEvidencePacketStateLabel,
  type PhenoCandidateEvidencePacket,
} from "@/lib/phenoEvidencePacket";

export interface PhenoCandidateEvidenceCoverageProps {
  packet: PhenoCandidateEvidencePacket | null | undefined;
  /** "loading" renders a calm placeholder; anything else renders the packet. */
  status: "loading" | "ready" | "error" | "disabled";
  /** Context for the Quick Log handoff. Null pieces simply omit the action. */
  plantName?: string | null;
  growId?: string | null;
  tentId?: string | null;
  /** Show "Record <goal> evidence" actions (workspace yes, compare no). */
  allowRecordActions?: boolean;
  "data-testid"?: string;
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : null;
}

export default function PhenoCandidateEvidenceCoverage({
  packet,
  status,
  plantName,
  growId,
  tentId,
  allowRecordActions = false,
  ...rest
}: PhenoCandidateEvidenceCoverageProps) {
  const testId = rest["data-testid"] ?? "pheno-candidate-evidence-coverage";

  if (status === "disabled") return null;
  if (status === "loading" || !packet) {
    return (
      <div data-testid={`${testId}-loading`} className="text-xs text-muted-foreground">
        Loading manual evidence coverage…
      </div>
    );
  }

  const record = (goalId: string) => {
    const prefillInput: PhenoEvidenceGoalQuickLogPrefillInput = {
      huntId: packet.huntId,
      plantId: packet.plantId,
      plantName: plantName ?? null,
      growId: growId ?? null,
      tentId: tentId ?? null,
      goalId,
      configuredGoals: packet.configuredGoals,
    };
    const prefill = buildPhenoEvidenceGoalQuickLogPrefill(prefillInput);
    if (!prefill) return;
    window.dispatchEvent(new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: prefill }));
  };

  const when = formatWhen(packet.latestEntryAt);
  const compromised = packet.state === "unavailable" || packet.state === "truncated";

  return (
    <section
      data-testid={testId}
      data-state={packet.state}
      aria-label="Manual evidence coverage"
      className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2 text-xs"
    >
      <p className="font-medium" data-testid={`${testId}-summary`}>
        Manual evidence: {packet.recordedGoalCount} of {packet.configuredGoalCount} configured
        goals recorded
        {when ? (
          <span className="ml-1 font-normal text-muted-foreground">· latest {when}</span>
        ) : null}
      </p>

      {compromised ? (
        <p role="status" data-testid={`${testId}-state`} className="text-muted-foreground">
          {phenoEvidencePacketStateLabel(packet.state)}
          {packet.state === "truncated"
            ? " — counts may be low; nothing here is hidden as complete."
            : " — your regular Quick Log still works."}
        </p>
      ) : null}

      {packet.configuredGoalCount === 0 && !compromised ? (
        <p className="text-muted-foreground">
          This hunt has no evidence goals configured yet.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1" data-testid={`${testId}-goals`}>
          {packet.goals.map((goal) => (
            <li key={goal.id}>
              {goal.recorded ? (
                <span
                  data-testid={`${testId}-goal-${goal.id}`}
                  data-recorded="true"
                  className="inline-flex items-center rounded-full border border-emerald-600/50 bg-emerald-500/10 px-2 py-0.5"
                >
                  {goal.label} ✓{goal.receiptCount > 1 ? ` ×${goal.receiptCount}` : ""}
                </span>
              ) : allowRecordActions && !compromised ? (
                <button
                  type="button"
                  data-testid={`${testId}-record-${goal.id}`}
                  aria-label={`Record ${goal.label} evidence`}
                  onClick={() => record(goal.id)}
                  className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Record {goal.label} evidence
                </button>
              ) : (
                <span
                  data-testid={`${testId}-goal-${goal.id}`}
                  data-recorded="false"
                  className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-muted-foreground"
                >
                  {goal.label} — missing
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
