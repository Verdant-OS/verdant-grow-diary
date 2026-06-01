/**
 * PlantDetailSectionNav — compact in-page jump links for Plant Detail.
 * Presentation/scroll polish only. Each button scrolls to and focuses a
 * stable static DOM anchor mounted by the Plant Detail page. Read-only:
 * no writes, no routing changes, no device control.
 */
import { Button } from "@/components/ui/button";
import {
  buildPlantDetailSectionAnchors,
  type PlantDetailSectionEntry,
  type PlantDetailSectionAnchorsInput,
} from "@/lib/plantDetailSectionAnchors";

const FOCUS_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function scrollToAnchor(targetId: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(targetId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  (el as HTMLElement).focus({ preventScroll: true });
}

function ariaLabelFor(entry: PlantDetailSectionEntry): string {
  if (entry.disabled && entry.disabledReason) {
    return `Jump to ${entry.label} (unavailable: ${entry.disabledReason})`;
  }
  return `Jump to ${entry.label} section`;
}

function renderEntry(entry: PlantDetailSectionEntry) {
  if (entry.disabled) {
    return (
      <div key={entry.kind} className="flex flex-col gap-0.5 shrink-0">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled
          aria-disabled="true"
          aria-label={ariaLabelFor(entry)}
          data-testid={entry.testId}
          className={`${FOCUS_CLASSES} opacity-60 cursor-not-allowed`}
        >
          {entry.label}
        </Button>
        {entry.disabledReason && (
          <p
            className="text-[10px] text-muted-foreground px-1"
            data-testid={`${entry.testId}-reason`}
          >
            {entry.disabledReason}
          </p>
        )}
      </div>
    );
  }
  return (
    <Button
      key={entry.kind}
      type="button"
      size="sm"
      variant="ghost"
      className={`shrink-0 ${FOCUS_CLASSES}`}
      data-testid={entry.testId}
      aria-label={ariaLabelFor(entry)}
      onClick={() => scrollToAnchor(entry.anchorId)}
    >
      {entry.label}
    </Button>
  );
}

export default function PlantDetailSectionNav(
  props: PlantDetailSectionAnchorsInput,
) {
  const entries = buildPlantDetailSectionAnchors(props);
  return (
    <nav
      aria-label="Plant Detail section jump links"
      data-testid="plant-detail-section-nav"
      className="my-3 -mx-1 overflow-x-auto"
    >
      <div className="flex items-start gap-1 px-1">
        {entries.map(renderEntry)}
      </div>
    </nav>
  );
}
