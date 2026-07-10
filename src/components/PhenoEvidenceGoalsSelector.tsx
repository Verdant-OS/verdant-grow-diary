import { PHENO_EVIDENCE_GOALS, type PhenoEvidenceGoalId } from "@/lib/phenoEvidenceGoals";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

/**
 * PhenoEvidenceGoalsSelector — presenter-only picker for the evidence goals
 * the grower plans to track. Pure UX; nothing is written to the DB here.
 * The selection lives in local onboarding state.
 */
export interface PhenoEvidenceGoalsSelectorProps {
  selected: ReadonlyArray<PhenoEvidenceGoalId>;
  onToggle: (id: PhenoEvidenceGoalId) => void;
  "data-testid"?: string;
}

export default function PhenoEvidenceGoalsSelector({
  selected,
  onToggle,
  ...rest
}: PhenoEvidenceGoalsSelectorProps) {
  const testId = rest["data-testid"] ?? "pheno-evidence-goals";
  const set = new Set(selected);
  return (
    <ul
      data-testid={testId}
      className="grid gap-2 sm:grid-cols-2"
    >
      {PHENO_EVIDENCE_GOALS.map((g) => {
        const checked = set.has(g.id);
        return (
          <li
            key={g.id}
            className="flex items-start gap-3 rounded-md border p-3"
          >
            <Checkbox
              id={`goal-${g.id}`}
              checked={checked}
              onCheckedChange={() => onToggle(g.id)}
              data-testid={`${testId}-toggle-${g.id}`}
            />
            <label
              htmlFor={`goal-${g.id}`}
              className="flex-1 min-w-0 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{g.label}</span>
                {g.startsPending ? (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    Pending until recorded
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
