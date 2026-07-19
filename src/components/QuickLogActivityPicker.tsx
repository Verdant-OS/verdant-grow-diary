/**
 * QuickLogActivityPicker — presenter-only activity grid driven by the
 * shared QUICK_LOG_ACTIVITY_DEFINITIONS. Every entry-point (DailyCheck,
 * Plant fast-actions, QuickLog dialog) can consume this component so the
 * v1a activity taxonomy is not duplicated in JSX.
 *
 * Never persists. Never fires save events. Never claims plant health.
 * Harvest renders visible-but-disabled with the shared backend-update
 * copy. Missing sensor/context stays unknown, never "healthy".
 */
import { Button } from "@/components/ui/button";
import {
  QUICK_LOG_ACTIVITY_LIST,
  type QuickLogActivityDefinition,
  type QuickLogActivityId,
} from "@/constants/quickLogActivityTypes";

export interface QuickLogActivityPickerProps {
  onSelect: (activity: QuickLogActivityDefinition) => void;
  /** Disable every option while the owning form has an in-flight save. */
  disabled?: boolean;
  /** Optional ids to hide from this picker (e.g. a page-specific fence). */
  hiddenIds?: readonly QuickLogActivityId[];
  /** Currently selected id, for visual highlight only. */
  selectedId?: QuickLogActivityId | null;
  /** Test-id prefix for the grid; defaults to "quick-log-activity". */
  testIdPrefix?: string;
}

export default function QuickLogActivityPicker({
  onSelect,
  disabled = false,
  hiddenIds,
  selectedId,
  testIdPrefix = "quick-log-activity",
}: QuickLogActivityPickerProps) {
  const hidden = new Set(hiddenIds ?? []);
  const entries = QUICK_LOG_ACTIVITY_LIST.filter((a) => !hidden.has(a.id));
  return (
    <div
      role="group"
      aria-label="Quick Log activity"
      data-testid={`${testIdPrefix}-picker`}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {entries.map((a) => {
        const optionDisabled = disabled || !a.enabled;
        const isSelected = !optionDisabled && selectedId === a.id;
        return (
          <div key={a.id} className="flex flex-col gap-1 min-w-0">
            <Button
              type="button"
              size="sm"
              variant={isSelected ? "default" : "outline"}
              disabled={optionDisabled}
              aria-disabled={optionDisabled || undefined}
              aria-pressed={isSelected || undefined}
              data-testid={`${testIdPrefix}-${a.id}`}
              data-activity-id={a.id}
              data-activity-enabled={a.enabled ? "true" : "false"}
              className="justify-start w-full"
              onClick={() => {
                if (optionDisabled) return;
                onSelect(a);
              }}
              title={!a.enabled ? (a.disabledReason ?? undefined) : a.description}
            >
              <span className="truncate">{a.label}</span>
            </Button>
            <p
              className="text-xs leading-snug text-muted-foreground px-1"
              data-testid={`${testIdPrefix}-${a.id}-safety`}
            >
              {a.safetyNote}
            </p>
            {!a.enabled && a.disabledReason && (
              <p
                className="text-xs leading-snug text-muted-foreground px-1"
                data-testid={`${testIdPrefix}-${a.id}-disabled-reason`}
                role="note"
              >
                {a.disabledReason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
