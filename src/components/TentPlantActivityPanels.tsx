/**
 * TentPlantActivityPanels — read-only presenter for the Tent Detail
 * per-plant Activity Panels.
 *
 * Pure presenter. All logic lives in
 * src/lib/tentPlantActivityPanelsViewModel.ts. No data fetching, no
 * writes, no AI, no alerts, no Action Queue, no device control. The
 * Add Quick Log CTA reuses the existing `verdant:open-quicklog` event.
 */

import { useId, useState } from "react";
import { Link } from "react-router-dom";
import type {
  TentPlantActivityPanelRow,
  TentPlantActivityPanelsViewModel,
} from "@/lib/tentPlantActivityPanelsViewModel";
import {
  TENT_PLANT_ACTIVITY_EVIDENCE_NOTES_LABEL,
  TENT_PLANT_ACTIVITY_EVIDENCE_NOTES_HELPER_COPY,
  TENT_PLANT_ACTIVITY_EVIDENCE_NOTES_PLACEHOLDER,
  TENT_PLANT_ACTIVITY_EVIDENCE_NOTES_CAUTION_COPY,
  TENT_PLANT_ACTIVITY_EVIDENCE_NOTES_CTA_COPY,
} from "@/lib/tentPlantActivityPanelsViewModel";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";
import DiaryEntryRemoveButton from "@/components/DiaryEntryRemoveButton";
import type { DiaryEntryRemovalViewerContext } from "@/lib/diaryEntryRemovalRules";

export interface TentPlantActivityPanelsProps {
  viewModel: TentPlantActivityPanelsViewModel;
  className?: string;
  testId?: string;
  /**
   * When true, render a layout-stable skeleton placeholder set instead of
   * panels. Skeletons never display fake plant or sensor values.
   */
  isLoading?: boolean;
  /** Number of skeleton placeholder cards to render while loading. */
  loadingSkeletonCount?: number;
  /**
   * Viewer context used to gate per-entry destructive controls. Required for
   * Remove log / Remove photo log controls to render. Customer/public/report
   * views must pass viewer flags so these controls stay hidden.
   */
  viewer?: DiaryEntryRemovalViewerContext;
  /** Tent id (forwarded for query invalidation only; never displayed). */
  tentId?: string | null;
  /** Grow id (forwarded for query invalidation only; never displayed). */
  growId?: string | null;
}

export const TENT_PLANT_ACTIVITY_LOADING_COPY = "Loading plant activity…";

function emitQuickLog(panel: TentPlantActivityPanelRow, note?: string) {
  if (!panel.quickLogPrefill) return;
  if (typeof window === "undefined") return;
  const trimmed = typeof note === "string" ? note.trim() : "";
  const detail =
    trimmed.length > 0
      ? { ...panel.quickLogPrefill, note: trimmed }
      : panel.quickLogPrefill;
  window.dispatchEvent(
    new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, { detail }),
  );
}

function EvidenceNotesSection({ panel }: { panel: TentPlantActivityPanelRow }) {
  const [draft, setDraft] = useState("");
  const labelId = useId();
  const textareaId = useId();
  const helperId = useId();
  const cautionId = useId();
  const trimmed = draft.trim();
  const disabled = trimmed.length === 0 || panel.quickLogDisabled;
  const handleSend = () => {
    if (disabled) return;
    emitQuickLog(panel, trimmed);
  };
  return (
    <div
      className="mt-2 space-y-1 border-t border-border/40 pt-2"
      data-testid={`${panel.testId}-evidence-notes`}
    >
      <label
        id={labelId}
        htmlFor={textareaId}
        className="text-[11px] font-medium text-muted-foreground"
        data-testid={`${panel.testId}-evidence-notes-label`}
      >
        {TENT_PLANT_ACTIVITY_EVIDENCE_NOTES_LABEL}
      </label>
      <p
        id={helperId}
        className="text-[11px] text-muted-foreground"
        data-testid={`${panel.testId}-evidence-notes-helper`}
      >
        {TENT_PLANT_ACTIVITY_EVIDENCE_NOTES_HELPER_COPY}
      </p>
      <textarea
        id={textareaId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={TENT_PLANT_ACTIVITY_EVIDENCE_NOTES_PLACEHOLDER}
        aria-labelledby={labelId}
        aria-describedby={`${helperId} ${cautionId}`}
        rows={3}
        data-testid={`${panel.testId}-evidence-notes-textarea`}
        className="w-full text-xs rounded-md border border-border bg-background p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p
        id={cautionId}
        className="text-[11px] text-muted-foreground"
        data-testid={`${panel.testId}-evidence-notes-caution`}
      >
        {TENT_PLANT_ACTIVITY_EVIDENCE_NOTES_CAUTION_COPY}
      </p>
      <div className="pt-1">
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          aria-label={`Add evidence note to Quick Log for ${panel.name}`}
          data-testid={`${panel.testId}-evidence-notes-send`}
          title={
            panel.quickLogDisabledReason ??
            (trimmed.length === 0 ? "Draft a note to enable." : undefined)
          }
          className="text-xs px-2.5 py-1 rounded-full border bg-secondary text-secondary-foreground border-border disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {TENT_PLANT_ACTIVITY_EVIDENCE_NOTES_CTA_COPY}
        </button>
      </div>
    </div>
  );
}

export default function TentPlantActivityPanels({
  viewModel,
  className,
  testId = "tent-plant-activity-panels",
  isLoading = false,
  loadingSkeletonCount,
  viewer,
  tentId,
  growId,
}: TentPlantActivityPanelsProps) {
  // Skeleton count matches the visible/scoped plant filter so the loading
  // shell matches the panels that will render. Falls back to 1 compact
  // placeholder when no plants are visible — never fakes plant cards.
  const derivedCount =
    typeof loadingSkeletonCount === "number" && Number.isFinite(loadingSkeletonCount)
      ? Math.floor(loadingSkeletonCount)
      : viewModel.scopedPanelCount;
  const skeletonCount = Math.max(1, Math.min(12, derivedCount > 0 ? derivedCount : 1));
  const hasVisiblePlants = viewModel.visiblePlantCount > 0;
  return (
    <section
      data-testid={testId}
      aria-label="Tent plant activity panels"
      className={`space-y-2 ${className ?? ""}`}
    >
      <p
        className="text-[11px] text-muted-foreground"
        data-testid="tent-plant-activity-panels-shared-env-reminder"
      >
        {viewModel.sharedEnvironmentReminderCopy}
      </p>
      {isLoading ? (
        <div
          role="status"
          aria-busy="true"
          aria-label={TENT_PLANT_ACTIVITY_LOADING_COPY}
          data-testid="tent-plant-activity-panels-loading"
          className="space-y-2"
        >
          <p className="sr-only">{TENT_PLANT_ACTIVITY_LOADING_COPY}</p>
          <ul
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
            data-testid="tent-plant-activity-panels-skeleton-list"
            data-skeleton-count={skeletonCount}
            data-has-visible-plants={hasVisiblePlants ? "true" : "false"}
            aria-hidden="true"
          >
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <li
                key={i}
                data-testid={`tent-plant-activity-panels-skeleton-${i}`}
                className="rounded-xl border border-border/50 p-3 bg-card animate-pulse min-h-[10.5rem] flex flex-col"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-1/2 bg-muted rounded mb-2" />
                    <div className="h-3 w-1/3 bg-muted/70 rounded" />
                  </div>
                  <div className="h-5 w-12 bg-muted/50 rounded-md shrink-0" />
                </div>
                <div className="mt-2 space-y-1.5 flex-1">
                  <div className="h-3 w-3/4 bg-muted/60 rounded" />
                  <div className="h-3 w-2/3 bg-muted/60 rounded" />
                  <div className="h-3 w-1/2 bg-muted/60 rounded" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="h-6 w-28 bg-muted/70 rounded-full" />
                  <div className="h-6 w-16 bg-muted/50 rounded" />
                  <div className="h-6 w-16 bg-muted/50 rounded" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <>

      {viewModel.emptyCopy && (
        <p
          className="text-sm text-muted-foreground"
          data-testid="tent-plant-activity-panels-empty"
          role="status"
        >
          {viewModel.emptyCopy}
        </p>
      )}
      {viewModel.panels.length > 0 && (
        <ul
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
          data-testid="tent-plant-activity-panels-list"
        >
          {viewModel.panels.map((panel) => (
            <li
              key={panel.id}
              className="rounded-xl border border-border/50 p-3 bg-card min-h-[10.5rem] flex flex-col"
              data-testid={panel.testId}
            >
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3
                    className="font-medium truncate"
                    data-testid={`${panel.testId}-name`}
                  >
                    {panel.name}
                  </h3>
                  {panel.strain && (
                    <p
                      className="text-xs text-muted-foreground truncate"
                      data-testid={`${panel.testId}-strain`}
                    >
                      {panel.strain}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {panel.isArchived && (
                    <span
                      className="text-[11px] rounded-md border px-1.5 py-0.5 text-muted-foreground"
                      data-testid={`${panel.testId}-archived`}
                      aria-label={`${panel.name} is archived`}
                    >
                      Archived
                    </span>
                  )}
                  {panel.stage && (
                    <span
                      className="text-[11px] rounded-md border px-1.5 py-0.5 text-muted-foreground"
                      data-testid={`${panel.testId}-stage`}
                    >
                      {panel.stage}
                    </span>
                  )}
                </div>
              </header>

              <div className="mt-2 space-y-1 text-xs">
                {panel.latestLogDateLabel ? (
                  <div className="flex items-center gap-2 flex-wrap" data-testid={`${panel.testId}-latest-log-row`}>
                    <p data-testid={`${panel.testId}-latest-log`}>
                      Latest log: {panel.latestLogDateLabel}
                      {panel.latestLogSummary ? ` — ${panel.latestLogSummary}` : ""}
                    </p>
                    {viewer && panel.latestLogEntryId ? (
                      <DiaryEntryRemoveButton
                        entry={{
                          id: panel.latestLogEntryId,
                          kind: "diary",
                          // Photo flag handled separately by Remove photo log.
                          photoUrl: null,
                        }}
                        viewer={viewer}
                        plantName={panel.name}
                        plantId={panel.id}
                        tentId={tentId ?? null}
                        growId={growId ?? null}
                      />
                    ) : null}
                  </div>
                ) : (
                  <p
                    className="text-muted-foreground"
                    data-testid={`${panel.testId}-no-diary`}
                  >
                    {panel.diaryEmptyCopy}
                  </p>
                )}
                {panel.hasRecentPhoto ? (
                  <div className="flex items-center gap-2 flex-wrap" data-testid={`${panel.testId}-recent-photo-row`}>
                    <p data-testid={`${panel.testId}-recent-photo`}>
                      Recent photo on file
                    </p>
                    {viewer && panel.latestPhotoEntryId ? (
                      <DiaryEntryRemoveButton
                        entry={{
                          id: panel.latestPhotoEntryId,
                          kind: "diary",
                          // Forces photo-log copy variant.
                          photoUrl: "x",
                        }}
                        viewer={viewer}
                        plantName={panel.name}
                        plantId={panel.id}
                        tentId={tentId ?? null}
                        growId={growId ?? null}
                      />
                    ) : null}
                  </div>
                ) : (
                  <p
                    className="text-muted-foreground"
                    data-testid={`${panel.testId}-no-photo`}
                  >
                    {panel.photoEmptyCopy}
                  </p>
                )}
                <p
                  className="text-muted-foreground"
                  data-testid={`${panel.testId}-harvest-watch`}
                >
                  {panel.harvestWatch.copy}
                </p>
                <p
                  className="text-[11px] text-muted-foreground"
                  data-testid={`${panel.testId}-harvest-watch-help`}
                >
                  {panel.harvestWatch.helpText} {panel.harvestWatch.cautionText}
                </p>
              </div>

              <EvidenceNotesSection panel={panel} />



              <div className="mt-auto pt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid={`${panel.testId}-add-quicklog`}
                  data-is-first-quicklog={panel.isFirstQuickLog ? "true" : "false"}
                  aria-label={panel.quickLogCtaAccessibleLabel}
                  aria-disabled={panel.quickLogDisabled || undefined}
                  disabled={panel.quickLogDisabled}
                  title={panel.quickLogDisabledReason ?? undefined}
                  onClick={() => emitQuickLog(panel)}
                  className="text-xs px-2.5 py-1 rounded-full border bg-primary text-primary-foreground border-primary disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {panel.quickLogCtaLabel}
                </button>
                <Link
                  to={panel.diaryHref}
                  aria-label={panel.diaryAccessibleLabel}
                  data-testid={`${panel.testId}-diary-link`}
                  className="text-xs underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  View diary
                </Link>
                <Link
                  to={panel.photosHref}
                  aria-label={panel.photosAccessibleLabel}
                  data-testid={`${panel.testId}-photos-link`}
                  data-anchor-blocked={
                    panel.photosAnchorBlocked ? "true" : undefined
                  }
                  className="text-xs underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  View photos
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
        </>
      )}
    </section>
  );
}
