/**
 * TentPlantRosterPanel — read-only presenter for the Tent Plant Roster.
 *
 * Pure presenter. All logic lives in
 * src/lib/tentPlantRosterViewModel.ts. No data fetching, no writes, no AI,
 * no alerts, no Action Queue, no device control.
 */

import { Link } from "react-router-dom";
import type { TentPlantRosterViewModel } from "@/lib/tentPlantRosterViewModel";

export interface TentPlantRosterPanelProps {
  viewModel: TentPlantRosterViewModel;
  testId?: string;
  className?: string;
}

function formatLatestLogAt(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  try {
    return new Date(t).toLocaleDateString();
  } catch {
    return null;
  }
}

export default function TentPlantRosterPanel({
  viewModel,
  testId = "tent-plant-roster-panel",
  className,
}: TentPlantRosterPanelProps) {
  return (
    <section
      data-testid={testId}
      aria-label="Tent Plant Roster"
      className={`glass rounded-2xl p-4 mb-6 ${className ?? ""}`}
    >
      <div className="mb-3">
        <h2 className="font-display font-semibold">Plant Roster</h2>
        <p
          className="text-xs text-muted-foreground mt-1"
          data-testid="tent-plant-roster-shared-environment-copy"
        >
          {viewModel.sharedEnvironmentCopy}
        </p>
        {viewModel.tentSensorContextLabel && (
          <p
            className="text-[11px] text-muted-foreground mt-1"
            data-testid="tent-plant-roster-tent-sensor-context"
          >
            <span className="rounded-md border px-1.5 py-0.5 mr-1">
              {viewModel.tentSensorContextNote}
            </span>
            {viewModel.tentSensorContextLabel}
          </p>
        )}
      </div>

      {viewModel.state === "unknown-relationship" && (
        <p
          className="text-sm text-muted-foreground py-3"
          data-testid="tent-plant-roster-unknown-relationship"
          role="status"
        >
          {viewModel.unknownRelationshipCopy}
        </p>
      )}

      {viewModel.state === "empty" && (
        <p
          className="text-sm text-muted-foreground py-3"
          data-testid="tent-plant-roster-empty"
        >
          {viewModel.emptyCopy}
        </p>
      )}

      {viewModel.state === "loaded" && (
        <ul
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3"
          data-testid="tent-plant-roster-list"
        >
          {viewModel.rows.map((row) => {
            const latest = formatLatestLogAt(row.latestLogAt);
            return (
              <li
                key={row.id}
                className="rounded-xl border border-border/50 p-3"
                data-testid={`tent-plant-roster-row-${row.id}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="font-medium truncate"
                    data-testid={`tent-plant-roster-row-${row.id}-name`}
                  >
                    {row.name}
                  </span>
                  {row.stage && (
                    <span
                      className="text-[11px] rounded-md border px-1.5 py-0.5 text-muted-foreground"
                      data-testid={`tent-plant-roster-row-${row.id}-stage`}
                    >
                      {row.stage}
                    </span>
                  )}
                </div>
                {row.strain && (
                  <p
                    className="text-xs text-muted-foreground mt-1 truncate"
                    data-testid={`tent-plant-roster-row-${row.id}-strain`}
                  >
                    {row.strain}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {latest && (
                    <span
                      data-testid={`tent-plant-roster-row-${row.id}-latest-log`}
                    >
                      Latest log: {latest}
                    </span>
                  )}
                  {row.hasRecentPhoto && (
                    <span
                      className="rounded-md border px-1.5 py-0.5"
                      data-testid={`tent-plant-roster-row-${row.id}-recent-photo`}
                    >
                      Recent photo
                    </span>
                  )}
                </div>
                <p
                  className="mt-2 text-[11px] text-muted-foreground"
                  data-testid={`tent-plant-roster-row-${row.id}-harvest-watch`}
                >
                  {row.harvestWatchPublicState ?? row.harvestWatchFallbackCopy}
                </p>
                <div className="mt-3">
                  <Link
                    to={row.plantDetailHref}
                    className="text-xs underline underline-offset-2"
                    data-testid={`tent-plant-roster-row-${row.id}-link`}
                  >
                    Open Plant Detail
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
