/**
 * PhenoCandidateEvidenceCoverage — presenter for one candidate's manual
 * evidence packet (configured-goal coverage from Quick Log receipts).
 *
 * Renders the pure packet verbatim; derives nothing in JSX. This is a
 * SEPARATE row from the structured readiness badge — coverage of configured
 * goals is not readiness and is never presented as a score, rank, or
 * recommendation. States are text-labeled (never color-only).
 *
 * "Record <goal> evidence" is gated by phenoEvidenceHandoffRules (canonical
 * Quick Log target integrity). Tentless / unavailable triangles never open a
 * dead Quick Log dialog — they surface an explicit repair CTA instead.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import {
  resolvePhenoEvidenceHandoff,
  type PhenoEvidenceHandoffCatalogStatus,
  type PhenoEvidenceHandoffDecision,
} from "@/lib/phenoEvidenceHandoffRules";
import type { PhenoEvidenceGoalQuickLogPrefillInput } from "@/lib/phenoEvidenceQuickLogPrefill";
import {
  phenoEvidencePacketStateLabel,
  type PhenoCandidateEvidencePacket,
} from "@/lib/phenoEvidencePacket";
import type { QuickLogTargetPlant, QuickLogTargetTent } from "@/lib/quickLogTargetIntegrityRules";

export interface PhenoCandidateEvidenceCoverageProps {
  packet: PhenoCandidateEvidencePacket | null | undefined;
  /** "loading" renders a calm placeholder; anything else renders the packet. */
  status: "loading" | "ready" | "error" | "disabled";
  /** Context for the Quick Log handoff. Null pieces simply omit the action. */
  plantName?: string | null;
  growId?: string | null;
  tentId?: string | null;
  /**
   * Plant + tent catalogs for canonical integrity resolution.
   * When omitted, handoff stays pending (fail closed — never invents target).
   */
  handoffPlants?: ReadonlyArray<QuickLogTargetPlant> | null;
  handoffTents?: ReadonlyArray<QuickLogTargetTent> | null;
  handoffCatalogStatus?: PhenoEvidenceHandoffCatalogStatus;
  onRetryHandoffCatalog?: () => void;
  /** Show "Record <goal> evidence" actions (workspace yes, compare no). */
  allowRecordActions?: boolean;
  "data-testid"?: string;
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : null;
}

function HandoffStatusPanel({
  testId,
  decision,
  onRetry,
  onDismiss,
}: {
  testId: string;
  decision: Exclude<PhenoEvidenceHandoffDecision, { kind: "ready" }>;
  onRetry?: () => void;
  onDismiss: () => void;
}) {
  const cta =
    decision.kind === "blocked" || decision.kind === "catalog_error" ? decision.cta : null;

  return (
    <div
      role="status"
      data-testid={`${testId}-handoff-blocked`}
      data-handoff-kind={decision.kind}
      data-handoff-reason={decision.kind === "blocked" ? decision.reason : decision.kind}
      className="mt-2 space-y-1.5 rounded-md border border-amber-600/40 bg-amber-500/10 p-2 text-xs"
    >
      <p className="font-medium" data-testid={`${testId}-handoff-title`}>
        {decision.title}
      </p>
      <p className="text-muted-foreground" data-testid={`${testId}-handoff-description`}>
        {decision.description}
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {cta?.kind === "retry_catalog" ? (
          <button
            type="button"
            data-testid={`${testId}-handoff-retry`}
            onClick={() => onRetry?.()}
            className="inline-flex items-center rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-secondary/60"
          >
            {cta.label}
          </button>
        ) : null}
        {cta &&
        cta.href &&
        (cta.kind === "assign_tent" || cta.kind === "open_plant" || cta.kind === "finish_setup") ? (
          <Link
            to={cta.href}
            data-testid={`${testId}-handoff-cta`}
            data-cta-kind={cta.kind}
            className="inline-flex items-center rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-secondary/60"
          >
            {cta.label}
          </Link>
        ) : null}
        <button
          type="button"
          data-testid={`${testId}-handoff-dismiss`}
          onClick={onDismiss}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default function PhenoCandidateEvidenceCoverage({
  packet,
  status,
  plantName,
  growId,
  tentId,
  handoffPlants = null,
  handoffTents = null,
  handoffCatalogStatus = "pending",
  onRetryHandoffCatalog,
  allowRecordActions = false,
  ...rest
}: PhenoCandidateEvidenceCoverageProps) {
  const testId = rest["data-testid"] ?? "pheno-candidate-evidence-coverage";
  const [handoffNotice, setHandoffNotice] = useState<Exclude<
    PhenoEvidenceHandoffDecision,
    { kind: "ready" }
  > | null>(null);

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
    const decision = resolvePhenoEvidenceHandoff({
      catalogStatus: handoffCatalogStatus,
      plants: handoffPlants,
      tents: handoffTents,
      prefillInput,
    });

    if (decision.kind !== "ready") {
      setHandoffNotice(decision);
      return;
    }

    setHandoffNotice(null);
    window.dispatchEvent(
      new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail: decision.prefill }),
    );
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
      {packet.state === "unavailable" ? (
        // A failed read is NOT zero evidence (Codex review): never render the
        // zeroed X-of-Y line when receipts could not be loaded at all.
        <p className="font-medium" data-testid={`${testId}-summary`}>
          Manual evidence: coverage unknown
        </p>
      ) : (
        <p className="font-medium" data-testid={`${testId}-summary`}>
          Manual evidence: {packet.recordedGoalCount} of {packet.configuredGoalCount} configured
          goals recorded
          {when ? (
            <span className="ml-1 font-normal text-muted-foreground">· latest {when}</span>
          ) : null}
        </p>
      )}

      {compromised ? (
        <p role="status" data-testid={`${testId}-state`} className="text-muted-foreground">
          {phenoEvidencePacketStateLabel(packet.state)}
          {packet.state === "truncated"
            ? " — counts may be low; nothing here is hidden as complete."
            : " — your regular Quick Log still works."}
        </p>
      ) : null}

      {packet.state === "unavailable" ? null : packet.configuredGoalCount === 0 && !compromised ? (
        <p className="text-muted-foreground">This hunt has no evidence goals configured yet.</p>
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

      {handoffNotice ? (
        <HandoffStatusPanel
          testId={testId}
          decision={handoffNotice}
          onRetry={onRetryHandoffCatalog}
          onDismiss={() => setHandoffNotice(null)}
        />
      ) : null}
    </section>
  );
}
