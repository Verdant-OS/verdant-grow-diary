/**
 * Plant Detail's primary Quick Log button.
 *
 * FA-20261119-M1 item 5: the header Quick Log and the plant page Quick Log
 * opened two different forms. Matthew picked the header (top-bar) form,
 * QuickLogV2Sheet, as the one Quick Log, so this button opens it aimed at the
 * plant, the same target the header derives on a plant route. The plant
 * page's other entries (Add quick check, photo upload, sensor Update) still
 * open PlantQuickLog.
 */
import { useState } from "react";
import { Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import QuickLogV2Sheet from "./QuickLogV2Sheet";

interface Props {
  plantId: string;
  /** Kept on the page so the One-Tent Loop specs keep one stable selector. */
  testId: string;
}

export default function PlantDetailQuickLogButton({ plantId, testId }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        type="button"
        onClick={() => setOpen(true)}
        data-testid={testId}
        className="min-h-11 gap-1 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Zap className="h-3.5 w-3.5" /> Quick Log
      </Button>
      <QuickLogV2Sheet open={open} onOpenChange={setOpen} defaultTargetKey={`plant:${plantId}`} />
    </>
  );
}
