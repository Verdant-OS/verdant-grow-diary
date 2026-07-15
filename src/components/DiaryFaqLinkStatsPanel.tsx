/**
 * DiaryFaqLinkStatsPanel — presenter that shows the operator which
 * cannabis-care FAQ topics they are opening most often from the diary,
 * plus a local on/off toggle for the click tracking itself.
 *
 * Data + preference are read from localStorage via
 * src/lib/diaryFaqLinkClickTracker.ts. Nothing is sent to the server,
 * no user id is used, and no diary entry text is stored.
 */
import { useCallback, useEffect, useState } from "react";
import { BarChart3, RotateCcw } from "lucide-react";
import {
  clearDiaryFaqLinkClickCounts,
  DIARY_FAQ_TOPIC_LABELS,
  isDiaryFaqLinkClickTrackingEnabled,
  rankDiaryFaqLinkClicks,
  readDiaryFaqLinkClickCounts,
  setDiaryFaqLinkClickTrackingEnabled,
} from "@/lib/diaryFaqLinkClickTracker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
  const [enabled, setEnabled] = useState(() =>
    isDiaryFaqLinkClickTrackingEnabled(),
  );

  const refresh = useCallback(() => {
    setRanked(rankDiaryFaqLinkClicks(readDiaryFaqLinkClickCounts()));
    setEnabled(isDiaryFaqLinkClickTrackingEnabled());
  }, []);

  useEffect(() => {
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const total = ranked.reduce((sum, r) => sum + r.count, 0);
  const max = ranked[0]?.count ?? 0;

  return (
    <section
      data-testid="diary-faq-link-stats-panel"
      data-tracking-enabled={String(enabled)}
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
        {ranked.length > 0 && (
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
        )}
      </header>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border/40 bg-background/40 px-3 py-2">
        <div className="min-w-0">
          <Label
            htmlFor="diary-faq-link-tracking-toggle"
            className="text-sm font-medium"
          >
            Track Related FAQ clicks in this browser
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Local only. No account, entry, or plant data is recorded.
            Existing counts are kept if you turn this off.
          </p>
        </div>
        <Switch
          id="diary-faq-link-tracking-toggle"
          data-testid="diary-faq-link-tracking-toggle"
          checked={enabled}
          onCheckedChange={(next) => {
            setDiaryFaqLinkClickTrackingEnabled(next);
            setEnabled(next);
          }}
          aria-label="Enable local Related FAQ click tracking"
        />
      </div>

      {ranked.length === 0 ? (
        <p
          data-testid="diary-faq-link-stats-empty"
          className="mt-4 text-sm text-muted-foreground"
        >
          {enabled
            ? "No Related FAQ clicks recorded yet. Open a Related FAQ link from your diary and the topic will show up here."
            : "Tracking is off. Turn it back on to start counting new Related FAQ clicks."}
        </p>
      ) : (
        <>
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
            {!enabled && " · new clicks are not being counted"}
          </p>
        </>
      )}
    </section>
  );
}
