/**
 * GrowLearningEpisodeList — filter bar (deterministic AND-semantics) plus a
 * mobile-safe list of Plant Memory Episode cards.
 *
 * SAFETY: filters are pure predicates over already-loaded episodes. No AI
 * ranking, no server round-trip per filter change.
 */
import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlantMemoryEpisodeCard } from "@/components/PlantMemoryEpisodeCard";
import {
  DEFAULT_GROW_LEARNING_FILTERS,
  filterGrowLearningEpisodes,
  sortGrowLearningEpisodes,
  type GrowLearningFilters,
  type GrowLearningSortOrder,
} from "@/lib/growLearningReviewViewModel";
import {
  PLAYBOOK_ACTION_CATEGORIES,
  PLAYBOOK_CATEGORY_LABELS,
} from "@/lib/nextRunPlaybookRules";
import {
  GROWER_RESPONSE_LABELS,
  NEXT_RUN_DECISION_LABELS,
} from "@/lib/plantMemoryEpisodeViewModel";
import { GROWER_RESPONSES, NEXT_RUN_DECISIONS } from "@/lib/plantMemoryEpisodeRules";
import type { PlantMemoryEpisode } from "@/lib/plantMemoryEpisodeRules";

export interface GrowLearningEpisodeListProps {
  readonly episodes: readonly PlantMemoryEpisode[];
}

const SORT_LABELS: Record<GrowLearningSortOrder, string> = {
  chronological: "Most recent first",
  outcome_first: "Outcome first (worsened → improved)",
  unresolved_first: "Unresolved first",
};

const ALL = "all";

export function GrowLearningEpisodeList({ episodes }: GrowLearningEpisodeListProps) {
  const [filters, setFilters] = useState<GrowLearningFilters>(DEFAULT_GROW_LEARNING_FILTERS);
  const [sortOrder, setSortOrder] = useState<GrowLearningSortOrder>("unresolved_first");

  const plantIds = useMemo(
    () => [...new Set(episodes.map((e) => e.plantId).filter((id): id is string => Boolean(id)))],
    [episodes],
  );
  const tentIds = useMemo(
    () => [...new Set(episodes.map((e) => e.tentId).filter((id): id is string => Boolean(id)))],
    [episodes],
  );

  const filtered = useMemo(
    () => filterGrowLearningEpisodes(episodes, filters),
    [episodes, filters],
  );
  const sorted = useMemo(
    () => sortGrowLearningEpisodes(filtered, sortOrder),
    [filtered, sortOrder],
  );

  return (
    <section aria-labelledby="grow-learning-episodes-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="grow-learning-episodes-heading" className="text-lg font-semibold">
          Episodes
        </h2>
        <p className="text-sm text-muted-foreground">
          {sorted.length} of {episodes.length}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter episodes">
        {plantIds.length > 1 ? (
          <Select
            value={filters.plantId ?? ALL}
            onValueChange={(v) => setFilters((f) => ({ ...f, plantId: v === ALL ? null : v }))}
          >
            <SelectTrigger className="w-[140px]" aria-label="Filter by plant">
              <SelectValue placeholder="Plant" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All plants</SelectItem>
              {plantIds.map((id) => (
                <SelectItem key={id} value={id}>
                  Plant
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {tentIds.length > 1 ? (
          <Select
            value={filters.tentId ?? ALL}
            onValueChange={(v) => setFilters((f) => ({ ...f, tentId: v === ALL ? null : v }))}
          >
            <SelectTrigger className="w-[140px]" aria-label="Filter by tent">
              <SelectValue placeholder="Tent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tents</SelectItem>
              {tentIds.map((id) => (
                <SelectItem key={id} value={id}>
                  Tent
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <Select
          value={filters.actionCategory ?? ALL}
          onValueChange={(v) =>
            setFilters((f) => ({
              ...f,
              actionCategory: v === ALL ? null : (v as GrowLearningFilters["actionCategory"]),
            }))
          }
        >
          <SelectTrigger className="w-[170px]" aria-label="Filter by action type">
            <SelectValue placeholder="Action type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All action types</SelectItem>
            {PLAYBOOK_ACTION_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {PLAYBOOK_CATEGORY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.outcomeStatus ?? ALL}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, outcomeStatus: v === ALL ? null : v }))
          }
        >
          <SelectTrigger className="w-[160px]" aria-label="Filter by outcome">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All outcomes</SelectItem>
            {GROWER_RESPONSES.map((status) => (
              <SelectItem key={status} value={status}>
                {GROWER_RESPONSE_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.nextRunDecision ?? ALL}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, nextRunDecision: v === ALL ? null : v }))
          }
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by next-run decision">
            <SelectValue placeholder="Next-run decision" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All decisions</SelectItem>
            {NEXT_RUN_DECISIONS.map((decision) => (
              <SelectItem key={decision} value={decision}>
                {NEXT_RUN_DECISION_LABELS[decision]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.evidenceCompleteness}
          onValueChange={(v) =>
            setFilters((f) => ({
              ...f,
              evidenceCompleteness: v as GrowLearningFilters["evidenceCompleteness"],
            }))
          }
        >
          <SelectTrigger className="w-[170px]" aria-label="Filter by evidence completeness">
            <SelectValue placeholder="Evidence" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any evidence</SelectItem>
            <SelectItem value="complete">Has usable evidence</SelectItem>
            <SelectItem value="limited">Evidence limited</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as GrowLearningSortOrder)}>
          <SelectTrigger className="w-[220px]" aria-label="Sort order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as GrowLearningSortOrder[]).map((order) => (
              <SelectItem key={order} value={order}>
                {SORT_LABELS[order]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">No episodes match these filters.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {sorted.map((episode) => (
            <li key={episode.episodeKey}>
              <PlantMemoryEpisodeCard episode={episode} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
