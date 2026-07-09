import type { PhenoOnboardingViewModel } from "@/lib/phenoHuntOnboardingViewModel";

/**
 * PhenoFirstEvidencePacketMapPreview — a matrix preview of the evidence
 * packet map for the hunt-in-progress. Rows are candidates, columns are
 * selected evidence goals. Cells always render "Not recorded" during
 * onboarding — this is a preview of the shape of the packet, not real
 * evidence data.
 */
export interface PhenoFirstEvidencePacketMapPreviewProps {
  vm: PhenoOnboardingViewModel;
  candidates: ReadonlyArray<{ id: string; name: string; strain?: string | null }>;
  "data-testid"?: string;
}

const NOT_RECORDED = "Not recorded";

export default function PhenoFirstEvidencePacketMapPreview({
  vm,
  candidates,
  ...rest
}: PhenoFirstEvidencePacketMapPreviewProps) {
  const testId = rest["data-testid"] ?? "pheno-evidence-packet-map";
  const selectedGoals = vm.evidenceGoalSummary.filter((g) => g.selected);

  if (candidates.length === 0 || selectedGoals.length === 0) {
    return (
      <div
        data-testid={`${testId}-empty`}
        className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground"
      >
        Add candidate plants and evidence goals to preview your Evidence Packet Map.
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className="overflow-x-auto rounded-md border"
    >
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="p-2 text-left font-medium">Candidate</th>
            {selectedGoals.map((g) => (
              <th
                key={g.id}
                scope="col"
                className="p-2 text-left font-medium"
                data-testid={`${testId}-col-${g.id}`}
              >
                {g.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr key={c.id} className="border-t" data-testid={`${testId}-row-${c.id}`}>
              <th scope="row" className="p-2 text-left font-medium align-top">
                <div className="truncate">{c.name}</div>
                {c.strain ? (
                  <div className="text-xs text-muted-foreground truncate">{c.strain}</div>
                ) : null}
              </th>
              {selectedGoals.map((g) => (
                <td
                  key={g.id}
                  className="p-2 align-top text-muted-foreground"
                  data-testid={`${testId}-cell-${c.id}-${g.id}`}
                  aria-disabled="true"
                >
                  {NOT_RECORDED}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
