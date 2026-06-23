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
 *  - Optional localStorage state stores ONLY known section IDs +
 *    booleans. Never entry IDs, plant/tent/user IDs, raw payloads,
 *    sensor values, or note text. Malformed storage is ignored and
 *    replaced with defaults.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildDiaryTimelineSections,
  type ClassifyDiaryTimelineEntryInput,
  type DiaryTimelineSectionId,
} from "@/lib/diaryTimelineSectionRules";
import {
  buildDefaultDiaryTimelineSectionState,
  buildDiaryTimelineSectionSummary,
  mergeSavedDiaryTimelineSectionState,
  parseDiaryTimelineSectionState,
  serializeDiaryTimelineSectionState,
  type DiaryTimelineSectionExpandedState,
} from "@/lib/diaryTimelineSectionStateRules";
import {
  buildDiaryTimelineEvidenceQualityForSection,
  buildDiaryTimelineEvidenceQualitySummary,
} from "@/lib/diaryTimelineEvidenceQualityRules";

export interface DiaryTimelineCategorySectionsProps<
  T extends ClassifyDiaryTimelineEntryInput & { id: string },
> {
  items: readonly T[];
  renderEntry: (item: T) => ReactNode;
  /** Optional accessible region label, e.g. "Plant timeline category view". */
  ariaLabel?: string;
  /** Optional test id root, defaults to "diary-timeline-category-sections". */
  testIdPrefix?: string;
  /**
   * Optional localStorage key. When provided, expanded/collapsed state
   * is persisted across reloads. Only known section IDs + booleans are
   * ever written. When omitted, state lives only in component memory.
   */
  storageKey?: string;
}

function safeReadStorage(key: string | undefined): string | null {
  if (!key) return null;
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key: string | undefined, value: string): void {
  if (!key) return;
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    /* localStorage may be disabled; UI state still works in-memory. */
  }
}

export function DiaryTimelineCategorySections<
  T extends ClassifyDiaryTimelineEntryInput & { id: string },
>({
  items,
  renderEntry,
  ariaLabel = "Timeline category view",
  testIdPrefix = "diary-timeline-category-sections",
  storageKey,
}: DiaryTimelineCategorySectionsProps<T>) {
  const sections = useMemo(() => buildDiaryTimelineSections(items), [items]);
  const summary = useMemo(
    () => buildDiaryTimelineSectionSummary(sections),
    [sections],
  );
  const evidenceSummary = useMemo(
    () => buildDiaryTimelineEvidenceQualitySummary(sections),
    [sections],
  );

  // Load saved state on mount (or fall back to defaults). Saved state
  // only overrides known section IDs; malformed storage is ignored.
  const [expanded, setExpanded] = useState<DiaryTimelineSectionExpandedState>(
    () => {
      const saved = parseDiaryTimelineSectionState(safeReadStorage(storageKey));
      return mergeSavedDiaryTimelineSectionState(sections, saved);
    },
  );

  // When the set of sections changes (e.g. filter applied), keep the
  // user's saved choices but ensure every known id has a default.
  useEffect(() => {
    setExpanded((prev) =>
      mergeSavedDiaryTimelineSectionState(sections, prev),
    );
    // sections identity changes when items change — safe to depend on.
  }, [sections]);

  function persist(next: DiaryTimelineSectionExpandedState) {
    if (!storageKey) return;
    safeWriteStorage(storageKey, serializeDiaryTimelineSectionState(next));
  }

  function toggle(id: DiaryTimelineSectionId) {
    setExpanded((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      persist(next);
      return next;
    });
  }

  function setAll(value: boolean) {
    setExpanded((prev) => {
      const next = { ...prev } as Record<DiaryTimelineSectionId, boolean>;
      for (const s of sections) next[s.id] = value;
      persist(next);
      return next;
    });
  }

  function reset() {
    const defaults = buildDefaultDiaryTimelineSectionState(sections);
    setExpanded(defaults);
    persist(defaults);
  }

  return (
    <section
      aria-label={ariaLabel}
      data-testid={testIdPrefix}
      className="space-y-2"
    >
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid={`${testIdPrefix}-controls`}
      >
        <button
          type="button"
          onClick={() => setAll(true)}
          data-testid={`${testIdPrefix}-expand-all`}
          className="text-xs rounded-md border border-border/50 bg-secondary/30 px-2 py-1 text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          data-testid={`${testIdPrefix}-collapse-all`}
          className="text-xs rounded-md border border-border/50 bg-secondary/30 px-2 py-1 text-foreground hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Collapse all
        </button>
        <button
          type="button"
          onClick={reset}
          data-testid={`${testIdPrefix}-reset`}
          className="text-xs rounded-md border border-border/40 bg-transparent px-2 py-1 text-muted-foreground hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
        >
          Reset sections
        </button>
        <p
          data-testid={`${testIdPrefix}-summary`}
          data-total={summary.totalEntries}
          data-non-empty={summary.nonEmptySections}
          data-other={summary.otherCount}
          className="ml-auto text-xs text-muted-foreground"
        >
          {summary.parts.join(" · ")}
        </p>
      </div>
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
