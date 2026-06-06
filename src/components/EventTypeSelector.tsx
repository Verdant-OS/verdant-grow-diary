/**
 * Presenter-only event type selector.
 *
 * Extracted from QuickLog so the event-type dropdown can be reused
 * without re-implementing the supported/coming-soon affordance.
 *
 * STRICT SCOPE:
 * - UI only. No state, no business logic, no validation.
 * - Values, labels, icons, and "Coming soon" disabled state come from
 *   src/lib/diary.ts EVENT_TYPES and isSupportedLegacyEventType — the
 *   same canonical sources the rest of QuickLog uses.
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
}

export function EventTypeSelector({
  value,
  onValueChange,
  label = "Event",
  id,
  testId,
}: EventTypeSelectorProps) {
  return (
    <div>
      <Label className="text-xs" htmlFor={id}>
        {label}
      </Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} data-testid={testId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EVENT_TYPES.map((t) => {
            const supported = isSupportedLegacyEventType(t.value);
            return (
              <SelectItem key={t.value} value={t.value} disabled={!supported}>
                <span className="inline-flex items-center gap-2">
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                  {!supported && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Coming soon
                    </span>
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}

export default EventTypeSelector;
