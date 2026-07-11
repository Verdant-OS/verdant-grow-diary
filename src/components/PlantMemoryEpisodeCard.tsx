/**
 * PlantMemoryEpisodeCard — the serious, evidence-oriented episode card.
 * Structure: Action → Evidence before → Grower response → Evidence after →
 * Next-run decision → Uncertainty.
 *
 * SAFETY:
 *  - Presenter only. Data arrives via props; no Supabase here.
 *  - Never claims the action caused the response. Copy stays observational.
 *  - No confidence percentage for causal effectiveness.
 *  - Sections use Collapsible (matches the one real expand/collapse
 *    precedent in this codebase, AiDoctorEvidencePanel) — Radix supplies
 *    aria-expanded/keyboard handling via a real <button>, no manual wiring.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PlantMemoryEpisodeEvidence } from "@/components/PlantMemoryEpisodeEvidence";
import { PlantMemoryEpisodeTimeline } from "@/components/PlantMemoryEpisodeTimeline";
import { LearningDecisionDialog } from "@/components/LearningDecisionDialog";
import { saveRunLearningDecision } from "@/lib/plantMemoryEpisodeService";
import {
  EPISODE_STATE_LABELS,
  EVIDENCE_WINDOW_LABELS,
  GROWER_RESPONSE_LABELS,
  NEXT_RUN_DECISION_LABELS,
  episodeUncertaintyLine,
} from "@/lib/plantMemoryEpisodeViewModel";
import type { PlantMemoryEpisode } from "@/lib/plantMemoryEpisodeRules";

export interface PlantMemoryEpisodeCardProps {
  readonly episode: PlantMemoryEpisode;
  readonly onDecisionSaved?: () => void;
}

export function PlantMemoryEpisodeCard({ episode, onDecisionSaved }: PlantMemoryEpisodeCardProps) {
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [expandedAction, setExpandedAction] = useState(false);
  const [expandedResponse, setExpandedResponse] = useState(true);

  const badgeVariant = episode.state === "needs_review" ? "destructive" : "secondary";

  return (
    <Card data-testid={`plant-memory-episode-${episode.action.actionQueueId}`}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">
            {episode.action.suggestedChange ?? "Completed action"}
          </CardTitle>
          <Badge variant={badgeVariant} aria-label={`Episode status: ${EPISODE_STATE_LABELS[episode.state]}`}>
            {EPISODE_STATE_LABELS[episode.state]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 1. Action */}
        <Collapsible open={expandedAction} onOpenChange={setExpandedAction}>
          <CollapsibleTrigger
            className="flex w-full items-center justify-between rounded px-2 py-1 text-sm font-semibold hover:bg-muted"
            data-testid="episode-section-action-trigger"
          >
            <span>Action</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expandedAction ? "rotate-180" : ""}`}
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Completed</dt>
                <dd>
                  <time dateTime={episode.action.completedAt}>
                    {formatWhen(episode.action.completedAt)}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Source</dt>
                <dd>{episode.action.source ?? "Unspecified"}</dd>
              </div>
              {episode.action.targetMetric ? (
                <div>
                  <dt className="text-muted-foreground">Target metric</dt>
                  <dd>{episode.action.targetMetric}</dd>
                </div>
              ) : null}
              {episode.action.reason ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd>{episode.action.reason}</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Manually completed by the grower. Verdant suggests; the grower approves and
              completes every action.
            </p>
          </CollapsibleContent>
        </Collapsible>

        {/* 2. Evidence before */}
        <PlantMemoryEpisodeEvidence
          windowLabel={EVIDENCE_WINDOW_LABELS.before}
          window="before"
          sensorSnapshots={episode.evidence.sensorSnapshots}
          photos={episode.evidence.photos}
        />

        {/* 3. Grower response */}
        <Collapsible open={expandedResponse} onOpenChange={setExpandedResponse}>
          <CollapsibleTrigger
            className="flex w-full items-center justify-between rounded px-2 py-1 text-sm font-semibold hover:bg-muted"
            data-testid="episode-section-response-trigger"
          >
            <span>Grower response</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expandedResponse ? "rotate-180" : ""}`}
              aria-hidden
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-1">
            {episode.outcome.status ? (
              <>
                <p className="text-sm font-medium">
                  {GROWER_RESPONSE_LABELS[episode.outcome.status]}
                </p>
                {episode.outcome.note ? (
                  <p className="text-sm text-muted-foreground">{episode.outcome.note}</p>
                ) : null}
                {episode.outcome.occurredAt ? (
                  <p className="text-xs text-muted-foreground">
                    Recorded <time dateTime={episode.outcome.occurredAt}>{formatWhen(episode.outcome.occurredAt)}</time>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No response recorded yet. More follow-up is needed.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* 4. Evidence after */}
        <PlantMemoryEpisodeEvidence
          windowLabel={EVIDENCE_WINDOW_LABELS.after}
          window="after"
          sensorSnapshots={episode.evidence.sensorSnapshots}
          photos={episode.evidence.photos}
        />

        {/* 5. Next-run decision */}
        <div>
          <h4 className="text-sm font-semibold">Next-run decision</h4>
          {episode.learning.decision ? (
            <div className="mt-1 space-y-1">
              <p className="text-sm font-medium">
                {NEXT_RUN_DECISION_LABELS[episode.learning.decision]}
              </p>
              {episode.learning.rationale ? (
                <p className="text-sm text-muted-foreground">{episode.learning.rationale}</p>
              ) : null}
              <button
                type="button"
                className="text-xs text-primary underline underline-offset-2"
                onClick={() => setDecisionOpen(true)}
              >
                Edit decision
              </button>
            </div>
          ) : episode.outcome.status ? (
            <button
              type="button"
              className="mt-1 text-sm text-primary underline underline-offset-2"
              onClick={() => setDecisionOpen(true)}
            >
              Choose next-run decision
            </button>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Available once a response is recorded.
            </p>
          )}
        </div>

        {/* Timeline */}
        <PlantMemoryEpisodeTimeline episode={episode} />

        {/* 6. Uncertainty — amber role="note" idiom (matches AiDoctorEvidencePanel /
            ContextualPhenoComparisonPanel; not the barely-used ui/alert.tsx wrapper). */}
        <div
          role="note"
          data-testid="episode-uncertainty-note"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
        >
          {episodeUncertaintyLine(episode)}
        </div>
      </CardContent>

      {decisionOpen ? (
        <LearningDecisionDialog
          open={decisionOpen}
          onOpenChange={setDecisionOpen}
          episode={episode}
          nowIso={new Date().toISOString()}
          onSave={async (draft) => {
            const result = await saveRunLearningDecision(draft);
            if (result.ok) {
              onDecisionSaved?.();
              return { ok: true };
            }
            return { ok: false, message: "Could not save this decision. Try again shortly." };
          }}
        />
      ) : null}
    </Card>
  );
}

function formatWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "Unknown time";
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
