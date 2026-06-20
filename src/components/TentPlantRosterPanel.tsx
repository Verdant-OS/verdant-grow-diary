/**
 * TentPlantRosterPanel — read-only presenter for the Tent Plant Roster.
 *
 * Pure presenter. All logic lives in
 * src/lib/tentPlantRosterViewModel.ts. No data fetching, no writes, no AI,
 * no alerts, no Action Queue, no device control.
 */

import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { TentPlantRosterViewModel } from "@/lib/tentPlantRosterViewModel";
import {
  buildTentPlantRosterQuickActions,
  dispatchTentPlantRosterQuickLog,
  tentPlantRosterQuickActionsTriggerLabel,
  TENT_PLANT_ROSTER_PHOTOS_FALLBACK_HINT_COPY,
  type TentPlantRosterQuickActionContext,
  type TentPlantRosterQuickActionEntry,
} from "@/lib/tentPlantRosterQuickActions";
import { trackTentRosterAction } from "@/lib/tentPlantRosterActionTracking";

export interface TentPlantRosterPanelProps {
  viewModel: TentPlantRosterViewModel;
  testId?: string;
  className?: string;
  /**
   * When provided, the Panel renders a "Show archived plants" toggle wired
   * to this callback. The current pressed state is read from
   * `viewModel.includeArchived`. Read-only — no writes, no persistence.
   */
  onToggleIncludeArchived?: (next: boolean) => void;
  /**
   * When provided, each row renders a compact quick-action menu (View
   * diary, Add Quick Log, View photos) wired to existing handoffs only.
   */
  quickActionContext?: TentPlantRosterQuickActionContext;
}

function formatLatestLogAt(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  try {
    return new Date(t).toLocaleDateString();
  } catch {
    return null;
  }
}

export default function TentPlantRosterPanel({
  viewModel,
  testId = "tent-plant-roster-panel",
  className,
  onToggleIncludeArchived,
  quickActionContext,
}: TentPlantRosterPanelProps) {
  const navigate = useNavigate();

  function handleEntryActivate(
    entry: TentPlantRosterQuickActionEntry,
    e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>,
    plantName: string | null,
  ) {
    if (entry.disabled) {
      e.preventDefault();
      return;
    }
    // Tracking first (swallowed) — must never block navigation/handoff.
    const trackingAction =
      entry.kind === "view_diary"
        ? "view_diary"
        : entry.kind === "add_quicklog"
          ? "add_quick_log"
          : "view_photos";
    trackTentRosterAction({
      action: trackingAction,
      plantName,
      hasTentContext: !!quickActionContext?.tentId,
      anchorBlocked: entry.anchorBlocked === true,
    });
    if (entry.event === "open-quicklog") {
      e.preventDefault();
      dispatchTentPlantRosterQuickLog(entry.eventPayload ?? null);
      // Close any open row menu after handoff.
      closeAllOpenRowMenus();
      return;
    }
    if (entry.href) {
      e.preventDefault();
      navigate(entry.href);
      closeAllOpenRowMenus();
    }
  }

  function closeAllOpenRowMenus() {
    if (typeof document === "undefined") return;
    document
      .querySelectorAll<HTMLDetailsElement>(
        '[data-testid^="tent-plant-roster-row-"][data-testid$="-actions"]',
      )
      .forEach((el) => {
        el.open = false;
      });
  }
  return (
    <section
      data-testid={testId}
      aria-label="Tent Plant Roster"
      className={`glass rounded-2xl p-4 mb-6 ${className ?? ""}`}
    >
      <div className="mb-3">
        <h2 className="font-display font-semibold">Plant Roster</h2>
        <p
          className="text-xs text-muted-foreground mt-1"
          data-testid="tent-plant-roster-shared-environment-copy"
        >
          {viewModel.sharedEnvironmentCopy}
        </p>
        <p
          className="text-[11px] text-muted-foreground mt-1"
          data-testid="tent-plant-roster-header-counts"
        >
          {viewModel.headerCountsCopy}
        </p>
        {viewModel.tentSensorContextLabel && (
          <p
            className="text-[11px] text-muted-foreground mt-1"
            data-testid="tent-plant-roster-tent-sensor-context"
          >
            <span className="rounded-md border px-1.5 py-0.5 mr-1">
              {viewModel.tentSensorContextNote}
            </span>
            {viewModel.tentSensorContextLabel}
          </p>
        )}
        {onToggleIncludeArchived && (
          <div className="mt-2">
            <label
              htmlFor="tent-plant-roster-show-archived-toggle"
              className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer"
            >
              <input
                id="tent-plant-roster-show-archived-toggle"
                type="checkbox"
                checked={viewModel.includeArchived}
                onChange={(e) => onToggleIncludeArchived(e.target.checked)}
                data-testid="tent-plant-roster-show-archived-toggle"
                aria-label={viewModel.archivedToggleAccessibleLabel}
                aria-describedby="tent-plant-roster-show-archived-help"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded"
              />
              <span>{viewModel.archivedToggleLabel}</span>
            </label>
            <p
              id="tent-plant-roster-show-archived-help"
              className="text-[11px] text-muted-foreground mt-1"
              data-testid="tent-plant-roster-show-archived-help"
            >
              {viewModel.archivedToggleHelpCopy}
            </p>
          </div>
        )}
      </div>


      {viewModel.state === "unknown-relationship" && (
        <p
          className="text-sm text-muted-foreground py-3"
          data-testid="tent-plant-roster-unknown-relationship"
          role="status"
        >
          {viewModel.unknownRelationshipCopy}
        </p>
      )}

      {viewModel.state === "empty" && (
        <div className="py-3">
          <p
            className="text-sm text-muted-foreground"
            data-testid="tent-plant-roster-empty"
          >
            {viewModel.emptyCopy}
          </p>
          {viewModel.emptyArchivedHintCopy && (
            <p
              className="text-xs text-muted-foreground mt-1"
              data-testid="tent-plant-roster-empty-archived-hint"
            >
              {viewModel.emptyArchivedHintCopy}
            </p>
          )}
        </div>
      )}

      {viewModel.state === "loaded" && (
        <ul
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
          data-testid="tent-plant-roster-list"
        >
          {viewModel.rows.map((row) => {
            const latest = formatLatestLogAt(row.latestLogAt);
            return (
              <li
                key={row.id}
                className="rounded-xl border border-border/50 p-3"
                data-testid={`tent-plant-roster-row-${row.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-medium truncate"
                    data-testid={`tent-plant-roster-row-${row.id}-name`}
                  >
                    {row.name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {row.isArchived && (
                      <span
                        className="text-[11px] rounded-md border px-1.5 py-0.5 text-muted-foreground"
                        data-testid={`tent-plant-roster-row-${row.id}-archived`}
                        title={viewModel.archivedBadgeHelpCopy}
                        aria-label={`${viewModel.archivedRowLabel}. ${viewModel.archivedBadgeHelpCopy}`}
                      >
                        <span aria-hidden="true">{viewModel.archivedRowLabel}</span>
                      </span>
                    )}

                    {row.stage && (
                      <span
                        className="text-[11px] rounded-md border px-1.5 py-0.5 text-muted-foreground"
                        data-testid={`tent-plant-roster-row-${row.id}-stage`}
                      >
                        {row.stage}
                      </span>
                    )}
                  </div>
                </div>
                {row.strain && (
                  <p
                    className="text-xs text-muted-foreground mt-1 truncate"
                    data-testid={`tent-plant-roster-row-${row.id}-strain`}
                  >
                    {row.strain}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {latest && (
                    <span
                      data-testid={`tent-plant-roster-row-${row.id}-latest-log`}
                    >
                      Latest log: {latest}
                    </span>
                  )}
                  {row.hasRecentPhoto && (
                    <span
                      className="rounded-md border px-1.5 py-0.5"
                      data-testid={`tent-plant-roster-row-${row.id}-recent-photo`}
                    >
                      Recent photo
                    </span>
                  )}
                </div>
                <p
                  className="mt-2 text-[11px] text-muted-foreground"
                  data-testid={`tent-plant-roster-row-${row.id}-harvest-watch`}
                >
                  {row.harvestWatchPublicState ?? row.harvestWatchFallbackCopy}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Link
                    to={row.plantDetailHref}
                    className="text-xs underline underline-offset-2"
                    data-testid={`tent-plant-roster-row-${row.id}-link`}
                  >
                    Open Plant Detail
                  </Link>
                  {quickActionContext && (
                    <TentPlantRosterRowActions
                      rowId={row.id}
                      rowName={row.name}
                      quickActionContext={quickActionContext}
                      onActivate={handleEntryActivate}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface TentPlantRosterRowActionsProps {
  rowId: string;
  rowName: string | null;
  quickActionContext: TentPlantRosterQuickActionContext;
  onActivate: (
    entry: TentPlantRosterQuickActionEntry,
    e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>,
    plantName: string | null,
  ) => void;
}

function TentPlantRosterRowActions({
  rowId,
  rowName,
  quickActionContext,
  onActivate,
}: TentPlantRosterRowActionsProps) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const summaryRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);

  const entries = buildTentPlantRosterQuickActions({
    plantId: rowId,
    plantName: rowName,
    tentId: quickActionContext.tentId,
    tentName: quickActionContext.tentName ?? null,
    growId: quickActionContext.growId ?? null,
  });
  const triggerLabel = tentPlantRosterQuickActionsTriggerLabel(rowName);
  const photosEntry = entries.find((e) => e.kind === "view_photos");
  const showPhotosFallbackHint = photosEntry?.anchorBlocked === true;

  // Click-outside closes the menu.
  useEffect(() => {
    if (typeof document === "undefined") return;
    function handleDocClick(ev: MouseEvent) {
      const el = detailsRef.current;
      if (!el || !el.open) return;
      const target = ev.target as Node | null;
      if (target && el.contains(target)) return;
      el.open = false;
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, []);

  function focusMenuItem(index: number) {
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]',
    );
    if (!items || items.length === 0) return;
    const safeIndex = ((index % items.length) + items.length) % items.length;
    items[safeIndex]?.focus();
  }

  function currentItemIndex(): number {
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]',
    );
    if (!items) return -1;
    const active = document.activeElement as HTMLElement | null;
    if (!active) return -1;
    return Array.from(items).indexOf(active);
  }

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (detailsRef.current) detailsRef.current.open = false;
      summaryRef.current?.focus();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = currentItemIndex();
      focusMenuItem(idx + 1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = currentItemIndex();
      focusMenuItem(idx <= 0 ? -1 : idx - 1);
    }
  }

  function handleSummaryKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key === "Escape" && detailsRef.current?.open) {
      e.preventDefault();
      detailsRef.current.open = false;
      summaryRef.current?.focus();
    }
  }

  return (
    <details
      ref={detailsRef}
      className="relative text-xs"
      data-testid={`tent-plant-roster-row-${rowId}-actions`}
    >
      <summary
        ref={(el) => {
          summaryRef.current = el;
        }}
        className="cursor-pointer list-none rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={triggerLabel}
        data-testid={`tent-plant-roster-row-${rowId}-actions-trigger`}
        onKeyDown={handleSummaryKeyDown}
      >
        Plant actions
      </summary>
      <ul
        ref={menuRef}
        role="menu"
        className="absolute right-0 z-10 mt-1 min-w-[10rem] rounded-md border bg-popover p-1 shadow-md"
        data-testid={`tent-plant-roster-row-${rowId}-actions-menu`}
        onKeyDown={handleMenuKeyDown}
      >
        {entries.map((entry) => {
          const baseClass =
            "block w-full text-left rounded-sm px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
          const aria = entry.disabled && entry.disabledReason
            ? `${entry.label} (unavailable: ${entry.disabledReason})`
            : entry.label;
          if (entry.event === "open-quicklog") {
            return (
              <li key={entry.kind} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={baseClass}
                  aria-label={aria}
                  aria-disabled={entry.disabled || undefined}
                  data-testid={entry.testId}
                  onClick={(e) => onActivate(entry, e, rowName)}
                >
                  {entry.label}
                </button>
              </li>
            );
          }
          return (
            <li key={entry.kind} role="none">
              <a
                role="menuitem"
                href={entry.href ?? "#"}
                className={baseClass}
                aria-label={aria}
                aria-disabled={entry.disabled || undefined}
                data-testid={entry.testId}
                data-anchor-blocked={entry.anchorBlocked ? "true" : undefined}
                onClick={(e) => onActivate(entry, e, rowName)}
              >
                {entry.label}
              </a>
            </li>
          );
        })}
        {showPhotosFallbackHint && (
          <li role="none" className="mt-1 px-2 py-1">
            <p
              className="text-[11px] text-muted-foreground"
              data-testid={`tent-plant-roster-row-${rowId}-photos-fallback-hint`}
            >
              {TENT_PLANT_ROSTER_PHOTOS_FALLBACK_HINT_COPY}
            </p>
          </li>
        )}
      </ul>
    </details>
  );
}
