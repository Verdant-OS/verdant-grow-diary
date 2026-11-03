import { useState } from "react";
import { Button } from "@/components/ui/button";
import TimelineCsvContextPanel, {
  type TimelineCsvContextPanelProps,
} from "@/components/TimelineCsvContextPanel";

/**
 * CSV chips use the bounded lineage select and render with the context
 * toggle closed. The banner and older-page controls stay behind the toggle.
 */
export function TimelineCsvContextGate(props: TimelineCsvContextPanelProps) {
  const [open, setOpen] = useState(false);
  const hasTent = props.entries.some((entry) => entry.tent_id);
  if (!props.growId || !hasTent) return null;
  return (
    <>
      <TimelineCsvContextPanel {...props} showChrome={open} />
      {open ? null : (
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
      )}
    </>
  );
}
