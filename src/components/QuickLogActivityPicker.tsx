/**
 * QuickLogActivityPicker — presenter-only activity grid driven by the
 * shared QUICK_LOG_ACTIVITY_DEFINITIONS. Every entry-point (DailyCheck,
 * Plant fast-actions, QuickLog dialog) can consume this component so the
 * v1a activity taxonomy is not duplicated in JSX.
 *
 * Never persists. Never fires save events. Never claims plant health.
 * Primary actions stay visible on mobile; less-common actions use an
 * accessible disclosure. Harvest availability comes from the selected
 * plant's canonical stage evaluation. Missing context fails closed.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type QuickLogActivityDefinition,
  type QuickLogActivityId,
} from "@/constants/quickLogActivityTypes";
import {
  buildQuickLogActivityPickerViewModel,
  type QuickLogActivityPickerItem,
} from "@/lib/quickLogActivityRules";

export interface QuickLogActivityPickerProps {
  onSelect: (activity: QuickLogActivityDefinition) => void;
  /** Disable every option while the owning form has an in-flight save. */
  disabled?: boolean;
  /** Optional ids to hide from this picker (e.g. a page-specific fence). */
  hiddenIds?: readonly QuickLogActivityId[];
  /** Currently selected id, for visual highlight only. */
  selectedId?: QuickLogActivityId | null;
  /** Current selected-plant stage. Missing/unrecognized context fails closed. */
  plantStage?: unknown;
  /** Test-id prefix for the grid; defaults to "quick-log-activity". */
  testIdPrefix?: string;
}

interface ActivityGridProps {
  entries: readonly QuickLogActivityPickerItem[];
  globallyDisabled: boolean;
  label: string;
  onSelect: (activity: QuickLogActivityDefinition) => void;
  selectedId: QuickLogActivityId | null | undefined;
  testId: string;
  testIdPrefix: string;
}

function ActivityGrid({
  entries,
  globallyDisabled,
  label,
  onSelect,
  selectedId,
  testId,
  testIdPrefix,
}: ActivityGridProps) {
  return (
    <div
      id={testId}
      role="group"
      aria-label={label}
      data-testid={testId}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
    >
      {entries.map(({ activity, disabled, disabledReason }) => {
        const optionDisabled = globallyDisabled || disabled;
        const isSelected = !optionDisabled && selectedId === activity.id;
        return (
          <div key={activity.id} className="flex min-w-0 flex-col gap-1">
            <Button
              type="button"
              size="sm"
              variant={isSelected ? "default" : "outline"}
              disabled={optionDisabled}
              aria-disabled={optionDisabled || undefined}
              aria-pressed={isSelected || undefined}
              data-testid={`${testIdPrefix}-${activity.id}`}
              data-activity-id={activity.id}
              data-activity-enabled={optionDisabled ? "false" : "true"}
              className="h-auto min-h-11 w-full justify-start whitespace-normal py-2.5 text-left"
              onClick={() => {
                if (optionDisabled) return;
                onSelect(activity);
              }}
              title={disabled ? disabledReason ?? undefined : activity.description}
            >
              <span className="min-w-0 break-words whitespace-normal text-left leading-snug">
                {activity.label}
              </span>
            </Button>
            <p
              className="px-1 text-xs leading-snug text-muted-foreground"
              data-testid={`${testIdPrefix}-${activity.id}-safety`}
            >
              {activity.safetyNote}
            </p>
            {disabled && disabledReason && (
              <p
                className="px-1 text-xs leading-snug text-muted-foreground"
                data-testid={`${testIdPrefix}-${activity.id}-disabled-reason`}
                role="note"
              >
                {disabledReason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function QuickLogActivityPicker({
  onSelect,
  disabled = false,
  hiddenIds,
  selectedId,
  plantStage,
  testIdPrefix = "quick-log-activity",
}: QuickLogActivityPickerProps) {
  const [additionalExpanded, setAdditionalExpanded] = useState(false);
  const view = buildQuickLogActivityPickerViewModel({ plantStage, hiddenIds });
  const selectedIsAdditional = view.additionalActivities.some(
    ({ activity }) => activity.id === selectedId,
  );
  const additionalOpen = additionalExpanded || selectedIsAdditional;
  const additionalId = `${testIdPrefix}-additional`;

  return (
    <div
      role="group"
      aria-label="Quick Log activity"
      data-testid={`${testIdPrefix}-picker`}
      className="space-y-2"
    >
      <ActivityGrid
        entries={view.primaryActivities}
        globallyDisabled={disabled}
        label="Primary activity types"
        onSelect={onSelect}
        selectedId={selectedId}
        testId={`${testIdPrefix}-primary`}
        testIdPrefix={testIdPrefix}
      />

      {view.additionalActivities.length > 0 && (
        <div className="space-y-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            className="min-h-11 w-full justify-between whitespace-normal text-left sm:w-auto"
            aria-expanded={additionalOpen}
            aria-controls={additionalId}
            data-testid={`${testIdPrefix}-more`}
            onClick={() => setAdditionalExpanded((open) => !open)}
          >
            More activity types
          </Button>
          {additionalOpen && (
            <ActivityGrid
              entries={view.additionalActivities}
              globallyDisabled={disabled}
              label="Additional activity types"
              onSelect={onSelect}
              selectedId={selectedId}
              testId={additionalId}
              testIdPrefix={testIdPrefix}
            />
          )}
        </div>
      )}
    </div>
  );
}
