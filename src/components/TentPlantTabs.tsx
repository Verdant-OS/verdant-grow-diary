/**
 * TentPlantTabs — read-only presenter for the Tent Detail plant tab strip.
 *
 * Pure presenter. All logic lives in src/lib/tentPlantTabsViewModel.ts.
 * No data fetching, no writes, no AI, no alerts, no Action Queue, no
 * device control.
 *
 * Implements real tablist semantics with arrow-key roving focus.
 */

import { useEffect, useRef } from "react";
import type { TentPlantTabsViewModel } from "@/lib/tentPlantTabsViewModel";

export interface TentPlantTabsProps {
  viewModel: TentPlantTabsViewModel;
  /** Called with the new selected plant id (null = "All plants"). */
  onSelect: (next: string | null) => void;
  testId?: string;
  className?: string;
}

export default function TentPlantTabs({
  viewModel,
  onSelect,
  testId = "tent-plant-tabs",
  className,
}: TentPlantTabsProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Notify caller when the view-model had to reset an invalid selection so
  // the parent can sync its state. Idempotent — onSelect is expected to be
  // a setState-style setter.
  useEffect(() => {
    if (viewModel.selectionWasReset) {
      onSelect(viewModel.selectedPlantId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewModel.selectionWasReset, viewModel.selectedPlantId]);

  function focusTabByIndex(index: number) {
    const tabs = listRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    );
    if (!tabs || tabs.length === 0) return;
    const safe = ((index % tabs.length) + tabs.length) % tabs.length;
    tabs[safe]?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const tabs = listRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    );
    if (!tabs || tabs.length === 0) return;
    const current = Array.from(tabs).indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusTabByIndex(current + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusTabByIndex(current <= 0 ? tabs.length - 1 : current - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTabByIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTabByIndex(tabs.length - 1);
    }
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Tent plant tabs"
      data-testid={testId}
      onKeyDown={handleKeyDown}
      className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}
    >
      {viewModel.tabs.map((tab) => {
        const key = tab.id ?? "__all__";
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab.isSelected}
            aria-label={tab.ariaLabel}
            tabIndex={tab.isSelected ? 0 : -1}
            data-testid={tab.testId}
            data-archived={tab.isArchived ? "true" : undefined}
            onClick={() => onSelect(tab.id)}
            className={`text-xs px-2.5 py-1 rounded-full border transition inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              tab.isSelected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-secondary/50 border-border/50 hover:bg-secondary"
            }`}
          >
            <span>{tab.label}</span>
            {tab.isArchived && (
              <span
                className="text-[10px] rounded-md border px-1 py-0 ml-1 text-muted-foreground"
                aria-hidden="true"
              >
                archived
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
