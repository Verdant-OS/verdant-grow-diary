/**
 * DiaryTimelineCategorySections — read-only presenter that renders the
 * already-loaded timeline items into the seven fixed category sections
 * defined in `diaryTimelineSectionRules.ts`.
 *
 * Hard contract:
 *  - Read-only UI. No writes, no Supabase, no functions.invoke, no AI,
 *    no automation, no device control.
 *  - Reuses the caller's existing entry renderer via `renderEntry` —
 *    this presenter does not re-implement entry card business logic.
 *  - Every input item appears in exactly one section. No entries are
 *    hidden.
 *  - Section order is fixed: Watering, Feeding, Training, Photos,
 *    Diagnoses, Harvest results, Other diary entries.
 *  - Sections with entries default expanded; empty sections default
 *    collapsed but the header + empty copy remain reachable.
 *  - No localStorage in this slice (saved state lands in a follow-up).
 */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildDiaryTimelineSections,
  type ClassifyDiaryTimelineEntryInput,
  type DiaryTimelineSectionId,
} from "@/lib/diaryTimelineSectionRules";

export interface DiaryTimelineCategorySectionsProps<
  T extends ClassifyDiaryTimelineEntryInput & { id: string },
> {
  items: readonly T[];
  renderEntry: (item: T) => ReactNode;
  /** Optional accessible region label, e.g. "Plant timeline category view". */
  ariaLabel?: string;
  /** Optional test id root, defaults to "diary-timeline-category-sections". */
  testIdPrefix?: string;
}

export function DiaryTimelineCategorySections<
  T extends ClassifyDiaryTimelineEntryInput & { id: string },
>({
  items,
  renderEntry,
  ariaLabel = "Timeline category view",
  testIdPrefix = "diary-timeline-category-sections",
}: DiaryTimelineCategorySectionsProps<T>) {
  const sections = buildDiaryTimelineSections(items);

  // Default: expand sections with entries, collapse empty sections.
  // Local UI-only state — no persistence in this slice.
  const [expanded, setExpanded] = useState<
    Record<DiaryTimelineSectionId, boolean>
  >(() => {
    const initial = {} as Record<DiaryTimelineSectionId, boolean>;
    for (const section of sections) initial[section.id] = section.count > 0;
    return initial;
  });

  function toggle(id: DiaryTimelineSectionId) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <section
      aria-label={ariaLabel}
      data-testid={testIdPrefix}
      className="space-y-2"
    >
      {sections.map((section) => {
        const isOpen = expanded[section.id];
        const headerId = `${testIdPrefix}-${section.id}-header`;
        const panelId = `${testIdPrefix}-${section.id}-panel`;
        return (
          <div
            key={section.id}
            data-testid={`${testIdPrefix}-section`}
            data-section-id={section.id}
            data-count={section.count}
            className="rounded-lg border border-border/50 bg-card/30"
          >
            <button
              id={headerId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              aria-label={`${section.label} (${section.count}) — ${
                isOpen ? "collapse" : "expand"
              }`}
              onClick={() => toggle(section.id)}
              data-testid={`${testIdPrefix}-section-toggle`}
              data-section-id={section.id}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-lg"
            >
              <span className="flex items-center gap-2">
                <span>{section.label}</span>
                <span
                  data-testid={`${testIdPrefix}-section-count`}
                  data-section-id={section.id}
                  className="tabular-nums rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] leading-4 text-muted-foreground"
                >
                  {section.count}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isOpen ? "rotate-0" : "-rotate-90",
                )}
              />
            </button>
            {isOpen && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                data-testid={`${testIdPrefix}-section-panel`}
                data-section-id={section.id}
                className="border-t border-border/40 px-3 py-2"
              >
                {section.count === 0 ? (
                  <p
                    data-testid={`${testIdPrefix}-section-empty`}
                    data-section-id={section.id}
                    className="text-xs text-muted-foreground"
                  >
                    {section.emptyCopy}
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {section.items.map((item) => (
                      <li
                        key={item.id}
                        data-testid={`${testIdPrefix}-section-item`}
                        data-section-id={section.id}
                        data-item-id={item.id}
                      >
                        {renderEntry(item)}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

export default DiaryTimelineCategorySections;
