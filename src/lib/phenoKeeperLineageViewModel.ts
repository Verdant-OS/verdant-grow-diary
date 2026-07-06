/**
 * phenoKeeperLineageViewModel
 *
 * Pure, DATA-ONLY presentation of pheno keeper lineage: where a preserved
 * phenotype came from (its hunt + source candidate) and which grows descend
 * from it. This is a family tree drawn from records the grower kept — it
 * changes nothing:
 *
 *  - No I/O. No fetch. No Supabase. No AI. No writes. No automation. Naming a
 *    keeper or showing its lineage never starts a grow or drives a device.
 *  - Downstream grows are supplied by the caller (from associations the grower
 *    records); this module only presents and honestly flags what's missing.
 *  - Deterministic ordering, null-safe on every field.
 */

export interface PhenoKeeperInput {
  readonly keeperId: string;
  readonly keeperName?: string | null;
  readonly huntId?: string | null;
  readonly huntName?: string | null;
  readonly sourcePlantId?: string | null;
  readonly sourceCandidateLabel?: string | null;
  readonly note?: string | null;
  readonly createdAt?: string | null;
}

export interface PhenoDownstreamGrowInput {
  readonly growId: string;
  readonly growName?: string | null;
  readonly startedAt?: string | null;
}

export interface PhenoKeeperOrigin {
  readonly huntId: string | null;
  readonly huntName: string | null;
  readonly sourcePlantId: string | null;
  readonly sourceCandidateLabel: string | null;
}

export interface PhenoDownstreamGrowView {
  readonly growId: string;
  readonly growName: string | null;
  readonly startedAt: string | null;
}

export type PhenoKeeperLineageMissingCode = "no_source_candidate" | "no_downstream_grows";

export interface PhenoKeeperLineageMissingFlag {
  readonly code: PhenoKeeperLineageMissingCode;
  readonly message: string;
}

const LINEAGE_MISSING_MESSAGES: Record<PhenoKeeperLineageMissingCode, string> = {
  no_source_candidate: "No source candidate recorded for this keeper",
  no_downstream_grows: "No downstream grows linked to this keeper yet",
};

export interface PhenoKeeperLineageView {
  readonly keeperId: string;
  readonly keeperName: string;
  readonly origin: PhenoKeeperOrigin;
  readonly note: string | null;
  readonly createdAt: string | null;
  readonly downstreamGrows: readonly PhenoDownstreamGrowView[];
  readonly downstreamGrowCount: number;
  readonly missing: readonly PhenoKeeperLineageMissingFlag[];
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function missing(code: PhenoKeeperLineageMissingCode): PhenoKeeperLineageMissingFlag {
  return { code, message: LINEAGE_MISSING_MESSAGES[code] };
}

function toDownstreamView(input: PhenoDownstreamGrowInput): PhenoDownstreamGrowView | null {
  const growId = cleanString(input?.growId);
  if (!growId) return null;
  return {
    growId,
    growName: cleanString(input.growName),
    startedAt: cleanString(input.startedAt),
  };
}

/**
 * Build the lineage view for one keeper, given any grows the caller associated
 * with it. Downstream grows are deduped by id and sorted newest-first (grows
 * without a start date sort last).
 */
export function buildPhenoKeeperLineageView(
  keeper: PhenoKeeperInput,
  downstreamGrows: readonly PhenoDownstreamGrowInput[] | null | undefined = [],
): PhenoKeeperLineageView {
  const keeperId = keeper.keeperId;
  const keeperName = cleanString(keeper.keeperName) ?? keeperId;
  const sourcePlantId = cleanString(keeper.sourcePlantId);

  const seen = new Set<string>();
  const views: PhenoDownstreamGrowView[] = [];
  for (const g of downstreamGrows ?? []) {
    const view = toDownstreamView(g);
    if (!view || seen.has(view.growId)) continue;
    seen.add(view.growId);
    views.push(view);
  }
  views.sort((a, b) => {
    const as = a.startedAt ?? "";
    const bs = b.startedAt ?? "";
    if (as && !bs) return -1;
    if (!as && bs) return 1;
    if (as !== bs) return as < bs ? 1 : -1; // newest first
    return a.growId.localeCompare(b.growId);
  });

  const missingFlags: PhenoKeeperLineageMissingFlag[] = [];
  if (!sourcePlantId) missingFlags.push(missing("no_source_candidate"));
  if (views.length === 0) missingFlags.push(missing("no_downstream_grows"));

  return {
    keeperId,
    keeperName,
    origin: {
      huntId: cleanString(keeper.huntId),
      huntName: cleanString(keeper.huntName),
      sourcePlantId,
      sourceCandidateLabel: cleanString(keeper.sourceCandidateLabel),
    },
    note: cleanString(keeper.note),
    createdAt: cleanString(keeper.createdAt),
    downstreamGrows: views,
    downstreamGrowCount: views.length,
    missing: missingFlags,
  };
}

/**
 * Build lineage views for a set of keepers. `downstreamGrowsByKeeperId` maps a
 * keeper id to the grows the grower associated with it. Preserves input order.
 */
export function buildPhenoKeeperLineage(
  keepers: readonly PhenoKeeperInput[] | null | undefined,
  downstreamGrowsByKeeperId?: Readonly<Record<string, readonly PhenoDownstreamGrowInput[]>> | null,
): PhenoKeeperLineageView[] {
  const list = Array.isArray(keepers) ? keepers : [];
  const map = downstreamGrowsByKeeperId ?? {};
  return list
    .filter((k) => k && typeof k.keeperId === "string" && k.keeperId.length > 0)
    .map((k) => buildPhenoKeeperLineageView(k, map[k.keeperId] ?? []));
}
