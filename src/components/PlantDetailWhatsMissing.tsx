/**
 * PlantDetailWhatsMissing — presentation-only guidance panel that tells
 * growers which plant-memory inputs are missing or stale.
 *
 * Read-only. Uses existing page data signals only. No writes, RPC,
 * scheduling, or autonomous actions.
 */
import { useMemo } from "react";
import { HelpCircle, Plus, Upload, Activity } from "lucide-react";
import { Link } from "react-router-dom";

import {
  buildPlantDetailWhatsMissing,
  type PlantDetailWhatsMissingInput,
} from "@/lib/plantDetailWhatsMissing";
import { usePlantRecentActivity } from "@/hooks/usePlantRecentActivity";
import { buildPlantRecentActivity } from "@/lib/plantRecentActivityRules";
import { classifyTimelineEntry } from "@/lib/timelineEntryClassification";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PlantDetailWhatsMissingProps {
  plantId: string | null | undefined;
  growId?: string | null;
  stage?: string | null;
  hasPlantPhoto?: boolean;
}

const HEADING_ID = "plant-detail-whats-missing-heading";
const PANEL_TEST_ID = "plant-detail-whats-missing-panel";

function dispatchQuickLog() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("verdant:open-quicklog", {
      bubbles: true,
      cancelable: true,
      detail: {},
    }),
  );
}

function deriveSignals(
  plantId: string | null | undefined,
  hasPlantPhoto: boolean,
  rawRows: readonly unknown[] | null | undefined,
): Pick<
  PlantDetailWhatsMissingInput,
  "hasTimelineEntries" | "hasRecentPhoto" | "hasSensorSnapshot" | "hasRecentWateringOrFeed"
> {
  const rows = buildPlantRecentActivity(rawRows ?? [], { plantId: plantId ?? null, limit: 10 });

  const hasTimelineEntries = rows.length > 0;
  let hasRecentPhoto = hasPlantPhoto;
  let hasSensorSnapshot = false;
  let hasRecentWateringOrFeed = false;

  for (const r of rows) {
    if (r.hasPhoto) hasRecentPhoto = true;
    if (r.hasSnapshot) hasSensorSnapshot = true;
    const cat = classifyTimelineEntry({ eventType: r.eventType });
    if (cat === "watering" || cat === "feeding") hasRecentWateringOrFeed = true;
  }

  return { hasTimelineEntries, hasRecentPhoto, hasSensorSnapshot, hasRecentWateringOrFeed };
}

export default function PlantDetailWhatsMissing({
  plantId,
  growId,
  stage,
  hasPlantPhoto = false,
}: PlantDetailWhatsMissingProps) {
  const { data: rawRows, isLoading } = usePlantRecentActivity(plantId ?? null);

  const signals = useMemo(() => {
    return deriveSignals(plantId, hasPlantPhoto, rawRows ?? []);
  }, [plantId, hasPlantPhoto, rawRows]);

  const prompts = useMemo(() => {
    return buildPlantDetailWhatsMissing({
      plantId,
      growId,
      stage,
      ...signals,
    });
  }, [plantId, growId, stage, signals]);

  return (
    <section
      aria-labelledby={HEADING_ID}
      data-testid={PANEL_TEST_ID}
      className="glass rounded-2xl p-4 my-3"
    >
      <header className="flex items-center gap-2 mb-3">
        <h2
          id={HEADING_ID}
          className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5 text-primary" />
          What&apos;s missing?
        </h2>
      </header>

      {isLoading ? (
        <ul
          data-testid="plant-detail-whats-missing-loading"
          role="status"
          aria-live="polite"
          className="space-y-2"
        >
          {Array.from({ length: 2 }).map((_, i) => (
            <li
              key={i}
              className="h-12 rounded-lg bg-secondary/40 animate-pulse"
              aria-hidden
            />
          ))}
          <span className="sr-only">Loading missing context prompts…</span>
        </ul>
      ) : prompts.length === 0 ? (
        <div
          data-testid="plant-detail-whats-missing-solid"
          className="rounded-xl border border-dashed border-border/50 bg-secondary/20 p-4 text-center"
        >
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            Plant memory is looking solid.
          </p>
        </div>
      ) : (
        <ul
          data-testid="plant-detail-whats-missing-list"
          className="space-y-2"
        >
          {prompts.map((p) => (
            <li
              key={p.kind}
              data-testid={`plant-detail-whats-missing-prompt-${p.kind}`}
              className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 rounded-lg border border-border/40 bg-card/30 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] uppercase tracking-wide shrink-0"
                  >
                    Missing
                  </Badge>
                  <span className="text-sm font-medium text-foreground/90">
                    {p.title}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.description}
                </p>
              </div>
              {p.cta && (
                <div className="shrink-0">
                  {p.cta.event === "open-quicklog" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1"
                      onClick={dispatchQuickLog}
                      data-testid={`plant-detail-whats-missing-cta-${p.kind}`}
                    >
                      <Plus className="h-3.5 w-3.5" /> {p.cta.label}
                    </Button>
                  ) : p.cta.href ? (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1"
                      data-testid={`plant-detail-whats-missing-cta-${p.kind}`}
                    >
                      <Link to={p.cta.href}>
                        {p.cta.kind === "upload_photo" ? (
                          <Upload className="h-3.5 w-3.5" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}{" "}
                        {p.cta.label}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
