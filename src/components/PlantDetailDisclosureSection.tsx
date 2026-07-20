import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { PlantDetailDisclosureGroup } from "@/lib/plantDetailDisclosureRules";

interface PlantDetailDisclosureSectionProps {
  group: PlantDetailDisclosureGroup;
  title: string;
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  anchorId?: string;
  className?: string;
}

export default function PlantDetailDisclosureSection({
  group,
  title,
  summary,
  open,
  onOpenChange,
  children,
  anchorId,
  className,
}: PlantDetailDisclosureSectionProps) {
  const contentId = `plant-detail-disclosure-${group}-content`;
  const summaryId = `plant-detail-disclosure-${group}-summary`;

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      data-testid={`plant-detail-disclosure-${group}`}
      className={cn("min-w-0 rounded-2xl border border-border/60 bg-card/35", className)}
    >
      <CollapsibleTrigger asChild>
        <button
          id={anchorId}
          type="button"
          aria-controls={contentId}
          aria-describedby={summaryId}
          data-testid={`plant-detail-disclosure-${group}-trigger`}
          className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left whitespace-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="min-w-0">
            <span className="block font-semibold text-foreground">{title}</span>
            <span
              id={summaryId}
              className="mt-0.5 block text-sm leading-snug text-muted-foreground"
            >
              {summary}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent
        forceMount
        id={contentId}
        hidden={!open}
        data-testid={`plant-detail-disclosure-${group}-content`}
        className="min-w-0 border-t border-border/50 px-4 pb-4 pt-3"
      >
        <div className="min-w-0 space-y-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
