/**
 * OperatorPhenoCrossesSection — presenter-only, ownership-safe display of
 * pheno_crosses using the full 15-value CrossType taxonomy.
 *
 * Hard constraints:
 *  - No Supabase reads/writes. Consumers pass `crosses` (owner-scoped) and a
 *    `keeperName(id)` lookup.
 *  - No Action Queue writes, no AI calls, no device control, no automation.
 *  - Never renders null male parent as a broken row. Selfing shows "Self",
 *    open-pollination shows "Open pollen", everything else shows the male
 *    keeper name (or "Unknown donor" when the id resolves to nothing).
 *  - Missing optional metadata (channel / generation / recurrent parent) is
 *    omitted — never guessed and never rendered as "unknown" certainty.
 *  - Unknown/legacy cross_type falls back safely to `crossTypeName` ("Cross").
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dna } from "lucide-react";
import type { CrossRow } from "@/lib/phenoKeepersService";
import {
  channelLabel,
  crossTypeName,
  isChannel,
  isCrossType,
  lineageLabel,
  requiresGeneration,
  requiresRecurrentParent,
} from "@/lib/genetics/breedingReproductionRules";

interface Props {
  crosses: readonly CrossRow[];
  keeperName: (id: string | null | undefined) => string | null;
  /** Display heading; keeps the section reusable under different mounts. */
  heading?: string;
}

const SELFING_TYPES = new Set(["selfing_s1", "selfing_sn"]);

function donorLabel(
  row: CrossRow,
  lookup: (id: string | null | undefined) => string | null,
): string {
  if (SELFING_TYPES.has(row.crossType)) {
    return row.crossType === "selfing_sn" ? "Self (Sn)" : "Self (S1)";
  }
  if (row.crossType === "open_pollination" && !row.maleKeeperId) {
    return "Open pollen";
  }
  const name = lookup(row.maleKeeperId);
  if (name && name.length > 0) return name;
  return row.maleKeeperId ? "Unknown donor" : "Donor not recorded";
}

function lineageBadge(row: CrossRow): string {
  if (!isCrossType(row.crossType)) return "Cross";
  const base = lineageLabel(row.crossType);
  // Append generation only when the taxonomy expects one AND we have it.
  if (requiresGeneration(row.crossType) && typeof row.generation === "number") {
    return `${base}${row.generation}`;
  }
  return base;
}

export default function OperatorPhenoCrossesSection({
  crosses,
  keeperName,
  heading = "Operator: pheno crosses",
}: Props) {
  return (
    <Card data-testid="operator-pheno-crosses-section" className="border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Dna className="h-4 w-4" aria-hidden /> {heading}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {crosses.length === 0 ? (
          <p
            className="text-xs text-muted-foreground italic"
            data-testid="operator-pheno-crosses-empty"
          >
            No crosses recorded.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="operator-pheno-crosses-list">
            {crosses.map((row) => {
              const typeIsKnown = isCrossType(row.crossType);
              const female = keeperName(row.femaleKeeperId) ?? "Unknown mother";
              const donor = donorLabel(row, keeperName);
              const showRecurrent = typeIsKnown && requiresRecurrentParent(row.crossType);
              const recurrentName =
                showRecurrent && row.recurrentParentId
                  ? (keeperName(row.recurrentParentId) ?? "Unknown recurrent parent")
                  : null;
              const showChannel = isChannel(row.channel);
              const showGeneration =
                typeIsKnown &&
                requiresGeneration(row.crossType) &&
                typeof row.generation === "number";
              const capturedAt = row.crossedAt ?? row.createdAt;

              return (
                <li
                  key={row.id}
                  data-testid={`operator-pheno-cross-${row.id}`}
                  data-cross-type={row.crossType}
                  data-cross-type-known={typeIsKnown ? "true" : "false"}
                  className="rounded-md border border-border/40 bg-secondary/10 p-2 text-xs space-y-1"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                      data-testid={`operator-pheno-cross-badge-${row.id}`}
                    >
                      {lineageBadge(row)}
                    </Badge>
                    <span
                      className="text-muted-foreground"
                      data-testid={`operator-pheno-cross-type-name-${row.id}`}
                    >
                      {crossTypeName(row.crossType)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span data-testid={`operator-pheno-cross-female-${row.id}`}>{female}</span>
                    <span aria-hidden className="text-muted-foreground">
                      ×
                    </span>
                    <span
                      data-testid={`operator-pheno-cross-donor-${row.id}`}
                      data-donor-kind={
                        SELFING_TYPES.has(row.crossType)
                          ? "self"
                          : row.crossType === "open_pollination" && !row.maleKeeperId
                            ? "open"
                            : row.maleKeeperId
                              ? "keeper"
                              : "unknown"
                      }
                    >
                      {donor}
                    </span>
                  </div>
                  {showRecurrent && (
                    <p
                      className="text-[11px] text-muted-foreground"
                      data-testid={`operator-pheno-cross-recurrent-${row.id}`}
                    >
                      Recurrent parent: {recurrentName ?? "not recorded"}
                    </p>
                  )}
                  {showChannel && (
                    <p
                      className="text-[11px] text-muted-foreground"
                      data-testid={`operator-pheno-cross-channel-${row.id}`}
                    >
                      Pollen channel: {channelLabel(row.channel)}
                    </p>
                  )}
                  {showGeneration && (
                    <p
                      className="text-[11px] text-muted-foreground"
                      data-testid={`operator-pheno-cross-generation-${row.id}`}
                    >
                      Generation: {row.generation}
                    </p>
                  )}
                  {capturedAt && (
                    <p
                      className="text-[11px] text-muted-foreground"
                      data-testid={`operator-pheno-cross-recorded-at-${row.id}`}
                      title={capturedAt}
                    >
                      Recorded: {new Date(capturedAt).toLocaleString()}
                    </p>
                  )}
                  {row.crossName && (
                    <p className="text-[11px]" data-testid={`operator-pheno-cross-name-${row.id}`}>
                      Name: {row.crossName}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
