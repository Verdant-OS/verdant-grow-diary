/**
 * Honest evidence posture pill. The reassuring (green) treatment is reserved for
 * a scoped all-negative posture; untested / inconclusive / positive never render
 * as reassuring. Copy stays scoped — never "clean" or "pathogen free".
 */
import { cn } from "@/lib/utils";
import { evidenceStateLabel } from "@/lib/genetics/screeningEvidenceRules";
import type { EvidenceState } from "@/lib/genetics/traceabilityTypes";

const TONE: Record<EvidenceState, string> = {
  positive: "bg-red-500/10 text-red-300 border-red-500/30",
  inconclusive: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  untested: "bg-white/[0.04] text-white/50 border-white/10",
  // Scoped negative — muted, not a triumphant green, and never "all clear".
  negative_scoped: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
};

export interface EvidenceStatePillProps {
  state: EvidenceState;
  openQuarantine?: boolean;
  className?: string;
}

export function EvidenceStatePill({ state, openQuarantine = false, className }: EvidenceStatePillProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 flex-wrap min-w-0", className)}>
      <span
        data-testid="evidence-state-pill"
        data-state={state}
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium max-w-full truncate",
          TONE[state],
        )}
      >
        {evidenceStateLabel(state)}
      </span>
      {openQuarantine ? (
        <span
          data-testid="evidence-quarantine-flag"
          className="inline-flex items-center rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-300"
        >
          In quarantine
        </span>
      ) : null}
    </span>
  );
}

export default EvidenceStatePill;
