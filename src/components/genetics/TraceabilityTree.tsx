/**
 * Semantic lineage tree. Renders the trace view as an accessible list
 * (role="tree" / "treeitem" with aria-level) — never canvas-only and never
 * drag-only, so it is fully keyboard- and screen-reader-operable. Deep lineage
 * indentation scrolls inside this container, so the page itself never overflows.
 */
import { cn } from "@/lib/utils";
import type { TraceView } from "@/lib/genetics/traceabilityViewModel";
import { EvidenceStatePill } from "./EvidenceStatePill";
import { UnknownStateChip, type UnknownKind } from "./UnknownStateChip";

export interface TraceabilityTreeProps {
  view: TraceView;
  className?: string;
}

function gapToKind(code: string): UnknownKind {
  switch (code) {
    case "unassigned_origin":
      return "unassigned";
    case "unknown_origin":
    case "no_accession_link":
      return "unknown";
    default:
      return "unknown";
  }
}

export function TraceabilityTree({ view, className }: TraceabilityTreeProps) {
  if (!view.shouldRender) {
    return (
      <div
        data-testid="traceability-empty"
        className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground"
      >
        No lineage to show yet. Link a source accession or assign this plant to a propagation batch to build its trace.
      </div>
    );
  }

  return (
    <div className={cn("w-full min-w-0", className)}>
      {view.truncated ? (
        <div
          data-testid="traceability-truncated"
          className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 break-words"
        >
          This trace was truncated — some lineage beyond the depth or node limit is not shown.
        </div>
      ) : null}

      {view.flags.length > 0 ? (
        <details data-testid="traceability-gaps" className="mb-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
          <summary className="cursor-pointer text-xs text-white/60">
            {view.flags.length} lineage gap{view.flags.length === 1 ? "" : "s"} we can&apos;t back up
          </summary>
          <ul className="mt-2 space-y-1">
            {view.flags.map((f, i) => (
              <li key={`${f.code}-${i}`} className="text-xs text-white/50 break-words">
                {f.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {/* Wide/deep trees scroll inside here — the page body never scrolls sideways. */}
      <div className="overflow-x-auto">
        <ul role="tree" aria-label="Lineage" className="min-w-0 space-y-1.5">
          {view.nodes.map((n) => {
            const indent = Math.min(n.depth, 8) * 16;
            return (
              <li
                key={n.key}
                role="treeitem"
                aria-level={n.depth + 1}
                data-testid="trace-node"
                data-kind={n.kind}
                className="min-w-0"
                style={{ paddingLeft: indent }}
              >
                <div className="flex min-w-0 flex-col gap-1 rounded-md border border-white/[0.06] bg-[#0f0f0f] px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/40">
                      {n.kindLabel}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium text-white/80" title={n.label}>
                      {n.label}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {n.edgeLabel ? (
                      <span className="text-[11px] text-white/40 break-words">{n.edgeLabel}</span>
                    ) : null}
                    {n.evidence ? (
                      <EvidenceStatePill state={n.evidence.state} openQuarantine={n.evidence.openQuarantine} />
                    ) : null}
                    {n.gaps.map((g) => (
                      <UnknownStateChip key={g.code} kind={gapToKind(g.code)} />
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default TraceabilityTree;
