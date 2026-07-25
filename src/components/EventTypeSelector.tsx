/**
 * Presenter-only event type selector.
 *
 * Extracted from QuickLog so the event-type dropdown can be reused
 * without exposing activities that this legacy save path cannot persist.
 *
 * STRICT SCOPE:
 * - UI only. No state, no business logic, no validation.
 * - Values, labels, and icons come from src/lib/diary.ts EVENT_TYPES.
 * - isSupportedLegacyEventType filters out activities that belong in the
 *   structured Quick Log path, so this selector never offers a dead choice.
 * - Does NOT touch the save path, RPC payload, or any sensor surface.
 */
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_TYPES } from "@/lib/diary";
import { isSupportedLegacyEventType } from "@/lib/legacyQuickLogUnifiedSave";

export interface EventTypeSelectorProps {
  value: string;
  onValueChange: (next: string) => void;
  /** Optional override; defaults to "Event" to match prior QuickLog copy. */
  label?: string;
  /** Optional id passthrough for label association / focus management. */
  id?: string;
  /** Optional test id; not set by default to preserve existing selectors. */
  testId?: string;
  /** Freeze selection while the owning form has an in-flight save. */
  disabled?: boolean;
  /** Narrow public-starter compatibility path; ordinary Water stays hidden. */
  allowLegacyWatering?: boolean;
}

export function EventTypeSelector({
  value,
  onValueChange,
  label = "Event",
  id,
  testId,
  disabled = false,
  allowLegacyWatering = false,
}: EventTypeSelectorProps) {
  return (
    <div>
      <Label className="text-xs" htmlFor={id}>
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EVENT_TYPES.filter(
            (t) =>
              (t.value !== "watering" || allowLegacyWatering) &&
              isSupportedLegacyEventType(t.value),
          ).map((t) => (
            <SelectItem key={t.value} value={t.value}>
              <span className="inline-flex items-center gap-2">
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default EventTypeSelector;
