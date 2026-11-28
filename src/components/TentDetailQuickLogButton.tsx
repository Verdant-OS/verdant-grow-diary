/**
 * Tent Detail's header Quick Log button (Cheek, 2026-11-28).
 *
 * Matthew usually logs at the tent level, so this opens the existing Quick
 * Log (QuickLogV2Sheet) with this tent selected and no plant, even when the
 * tent has a single plant. A note about one plant starts from that plant's
 * page instead (PlantDetailQuickLogButton). The sheet's own save path, target
 * picker and Save-row destination are unchanged.
 */
import { useState } from "react";
import { Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import QuickLogV2Sheet from "./QuickLogV2Sheet";

interface Props {
  tentId: string;
  testId?: string;
}

export function tentHeaderQuickLogTargetKey(tentId: string): string {
  return `tent:${tentId}`;
}

export default function TentDetailQuickLogButton({
  tentId,
  testId = "tent-detail-header-quick-log",
}: Props) {
  const [open, setOpen] = useState(false);
  // The sheet mounts on the first tap and then stays, so its draft and close
  // animation behave as on every other entry, and a tent page that is only
  // read never mounts a second Quick Log.
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Button
        size="sm"
        type="button"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        data-testid={testId}
        className="min-h-11 gap-1 whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Zap className="h-3.5 w-3.5" aria-hidden="true" /> Quick Log
      </Button>
      {mounted ? (
        <QuickLogV2Sheet
          open={open}
          onOpenChange={setOpen}
          defaultTargetKey={tentHeaderQuickLogTargetKey(tentId)}
        />
      ) : null}
    </>
  );
}
