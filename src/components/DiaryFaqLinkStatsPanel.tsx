/**
 * DiaryFaqLinkStatsPanel — presenter that shows the operator which
 * cannabis-care FAQ topics they are opening most often from the diary.
 *
 * Data is read from localStorage via
 * src/lib/diaryFaqLinkClickTracker.ts. Nothing is sent to the server,
 * no user id is used, and no diary entry text is stored. When there
 * are no recorded clicks, the panel renders nothing so first-time and
 * anonymous visitors see no leftover UI.
 */
import { useCallback, useEffect, useState } from "react";
import { BarChart3, RotateCcw } from "lucide-react";
import {
  clearDiaryFaqLinkClickCounts,
  DIARY_FAQ_TOPIC_LABELS,
  rankDiaryFaqLinkClicks,
  readDiaryFaqLinkClickCounts,
} from "@/lib/diaryFaqLinkClickTracker";
import { cn } from "@/lib/utils";

export interface DiaryFaqLinkStatsPanelProps {
  className?: string;
}

export default function DiaryFaqLinkStatsPanel({
  className,
}: DiaryFaqLinkStatsPanelProps) {
  const [ranked, setRanked] = useState(() =>
    rankDiaryFaqLinkClicks(readDiaryFaqLinkClickCounts()),
  );

  const refresh = useCallback(() => {
    setRanked(rankDiaryFaqLinkClicks(readDiaryFaqLinkClickCounts()));
  }, []);

  useEffect(() => {
    // Pick up counts recorded on other tabs/pages.
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  if (ranked.length === 0) return null;

  const total = ranked.reduce((sum, r) => sum + r.count, 0);
  const max = ranked[0].count;

  return (
    <section
      data-testid="diary-faq-link-stats-panel"
      className={cn(
        "rounded-lg border border-border/60 p-5 bg-card/40",
        className,
      )}
      aria-label="Your most-linked FAQ topics from the diary"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h2 className="font-display text-lg font-semibold">
            Your most-linked FAQ topics
          </h2>
        </div>
        <button
          type="button"
          data-testid="diary-faq-link-stats-clear"
          onClick={() => {
            clearDiaryFaqLinkClickCounts();
            refresh();
          }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Clear
        </button>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        Counted locally in this browser only. No account, entry, or plant
        data is recorded.
      </p>
      <ul className="mt-4 space-y-2">
        {ranked.map((row) => {
          const pct = Math.max(4, Math.round((row.count / max) * 100));
          return (
            <li
              key={row.topic}
              data-testid={`diary-faq-link-stats-row-${row.topic}`}
              data-count={String(row.count)}
              className="flex items-center gap-3 text-sm"
            >
              <span className="w-40 shrink-0 text-foreground/90">
                {DIARY_FAQ_TOPIC_LABELS[row.topic]}
              </span>
              <div className="flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden">
                <div
                  className="h-full bg-primary/70"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
              </div>
              <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">
                {row.count}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Total clicks: <span className="tabular-nums">{total}</span>
      </p>
    </section>
  );
}
