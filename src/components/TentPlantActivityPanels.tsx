/**
 * TentPlantActivityPanels — read-only presenter for the Tent Detail
 * per-plant Activity Panels.
 *
 * Pure presenter. All logic lives in
 * src/lib/tentPlantActivityPanelsViewModel.ts. No data fetching, no
 * writes, no AI, no alerts, no Action Queue, no device control. The
 * Add Quick Log CTA reuses the existing `verdant:open-quicklog` event.
 */

import { Link } from "react-router-dom";
import type {
  TentPlantActivityPanelRow,
  TentPlantActivityPanelsViewModel,
} from "@/lib/tentPlantActivityPanelsViewModel";
import { PLANT_QUICKLOG_PREFILL_EVENT } from "@/lib/plantQuickLogPrefillRules";

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
}

export const TENT_PLANT_ACTIVITY_LOADING_COPY = "Loading plant activity…";

function emitQuickLog(panel: TentPlantActivityPanelRow) {
  if (!panel.quickLogPrefill) return;
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PLANT_QUICKLOG_PREFILL_EVENT, {
      detail: panel.quickLogPrefill,
    }),
  );
}

export default function TentPlantActivityPanels({
  viewModel,
  className,
  testId = "tent-plant-activity-panels",
  isLoading = false,
  loadingSkeletonCount,
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
                  <p data-testid={`${panel.testId}-latest-log`}>
                    Latest log: {panel.latestLogDateLabel}
                    {panel.latestLogSummary ? ` — ${panel.latestLogSummary}` : ""}
                  </p>
                ) : (
                  <p
                    className="text-muted-foreground"
                    data-testid={`${panel.testId}-no-diary`}
                  >
                    {panel.diaryEmptyCopy}
                  </p>
                )}
                {panel.hasRecentPhoto ? (
                  <p data-testid={`${panel.testId}-recent-photo`}>
                    Recent photo on file
                  </p>
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
