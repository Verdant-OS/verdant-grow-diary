import { useState } from "react";
import { Button } from "@/components/ui/button";
import TimelineCsvContextPanel, {
  type TimelineCsvContextPanelProps,
} from "@/components/TimelineCsvContextPanel";

/** CSV history stays off the timeline until the grower asks for it. */
export function TimelineCsvContextGate(props: TimelineCsvContextPanelProps) {
  const [open, setOpen] = useState(false);
  const hasTent = props.entries.some((entry) => entry.tent_id);
  if (!props.growId || !hasTent) return null;
  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        data-testid="timeline-csv-context-open"
        onClick={() => setOpen(true)}
      >
        Show CSV environment context
      </Button>
    );
  }
  return <TimelineCsvContextPanel {...props} />;
}
