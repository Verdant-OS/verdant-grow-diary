/**
 * PhenoHuntProgressPanel — honest readiness + Evidence Packet Map for a hunt.
 *
 * Presenter-only: derives the readiness stage from the persisted setup state
 * (goal, setup_confirmed_at) and the evidence actually recorded per candidate
 * (scores, rounds, sex observations, smoke tests, lab results). Keeper
 * decisions are deliberately not evidence. Never ranks candidates, never
 * suggests keeps.
 */
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import {
  candidateHasEvidence,
  countCandidatesWithEvidence,
  deriveHuntReadiness,
  HUNT_READINESS_COPY,
  type CandidateEvidenceSignals,
} from "@/lib/phenoHuntOnboardingViewModel";

export interface PhenoHuntProgressPanelProps {
  huntId: string;
  goal: string | null;
  setupConfirmedAt: string | null;
  candidates: readonly PhenoCandidateInput[];
  signals: CandidateEvidenceSignals;
}

const EVIDENCE_COLUMNS: ReadonlyArray<{
  key: string;
  label: string;
  has: (plantId: string, s: CandidateEvidenceSignals) => boolean;
}> = [
  {
    key: "scores",
    label: "Trait scores",
    has: (id, s) => {
      if (s.scoresByPlant?.[id] != null) return true;
      const prefix = `${id}:`;
      return Object.keys(s.roundsByKey ?? {}).some((k) => k.startsWith(prefix));
    },
  },
  { key: "sex", label: "Sex", has: (id, s) => s.sexByPlant?.[id] != null },
  { key: "smoke", label: "Smoke test", has: (id, s) => s.smokeByPlant?.[id] != null },
  {
    key: "lab",
    label: "Lab",
    has: (id, s) => {
      const prefix = `${id}:`;
      return Object.keys(s.labByKey ?? {}).some((k) => k.startsWith(prefix));
    },
  },
];

export default function PhenoHuntProgressPanel({
  huntId,
  goal,
  setupConfirmedAt,
  candidates,
  signals,
}: PhenoHuntProgressPanelProps) {
  const plantIds = candidates.map((c) => c.candidateId);
  const stage = deriveHuntReadiness({
    hasGoal: !!goal?.trim(),
    setupConfirmed: !!setupConfirmedAt,
    candidateCount: candidates.length,
    candidatesWithEvidence: countCandidatesWithEvidence(plantIds, signals),
  });
  const copy = HUNT_READINESS_COPY[stage];

  return (
    <section
      data-testid="pheno-hunt-progress"
      aria-label="Hunt readiness and evidence packet map"
      className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" data-testid="hunt-readiness-stage" data-stage={stage}>
          {copy.label}
        </Badge>
        <p className="text-xs text-muted-foreground">{copy.description}</p>
      </div>

      {!setupConfirmedAt ? (
        <div
          data-testid="continue-setup-banner"
          className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm"
        >
          Setup isn’t confirmed yet.{" "}
          <Link
            to={`/pheno-hunts/${huntId}/setup`}
            data-testid="continue-setup-link"
            className="font-medium text-primary hover:underline"
          >
            Continue setup
          </Link>
        </div>
      ) : null}

      <p className="text-sm" data-testid="hunt-goal">
        <span className="font-medium">Goal:</span>{" "}
        {goal?.trim() ? (
          <span>{goal}</span>
        ) : (
          <span className="text-muted-foreground">
            No goal recorded (created before guided setup).
          </span>
        )}
      </p>

      {candidates.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="evidence-packet-map">
            <caption className="sr-only">
              Evidence packet map: recorded evidence per candidate
            </caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1 pr-3 font-medium">
                  Candidate
                </th>
                {EVIDENCE_COLUMNS.map((col) => (
                  <th scope="col" key={col.key} className="py-1 pr-3 font-medium">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr
                  key={c.candidateId}
                  data-testid={`evidence-packet-row-${c.candidateId}`}
                  data-has-evidence={candidateHasEvidence(c.candidateId, signals)}
                  className="border-t border-border/40"
                >
                  <th scope="row" className="py-1.5 pr-3 font-medium text-left">
                    {c.candidateLabel ?? c.candidateId}
                  </th>
                  {EVIDENCE_COLUMNS.map((col) => {
                    const present = col.has(c.candidateId, signals);
                    return (
                      <td key={col.key} className="py-1.5 pr-3">
                        <span
                          aria-label={present ? `${col.label} recorded` : `${col.label} not recorded`}
                          className={present ? "text-emerald-600" : "text-muted-foreground"}
                        >
                          {present ? "✓" : "—"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Setup complete ≠ comparison-ready: comparison needs recorded evidence
        on at least two candidates.
      </p>
    </section>
  );
}
