/**
 * Plant Detail's primary Quick Log button.
 *
 * FA-20261119-M1 item 5: the header Quick Log and the plant page Quick Log
 * opened two different forms. Matthew picked the header (top-bar) form,
 * QuickLogV2Sheet, as the one Quick Log.
 */
import { Zap } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  plantId: string;
  /** Kept on the page so the One-Tent Loop specs keep one stable selector. */
  testId: string;
  /** Opens the plant page's own form (being replaced). */
  onOpen?: () => void;
}

export default function PlantDetailQuickLogButton({ testId, onOpen }: Props) {
  return (
    <Button
      size="sm"
      type="button"
      onClick={() => onOpen?.()}
      data-testid={testId}
      className="min-h-11 gap-1 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90"
    >
      <Zap className="h-3.5 w-3.5" /> Quick Log
    </Button>
  );
}
