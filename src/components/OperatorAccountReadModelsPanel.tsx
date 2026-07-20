/**
 * Read-only Operator Mode presenter for the signed-in grower's own MCP-backed
 * diary and sensor read models. Data access stays in the companion hook.
 */
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  OperatorAccountReadModelsPanelModel,
  OperatorDiaryEntryRow,
  OperatorPanelCollectionState,
  OperatorPanelSensorState,
  OperatorSensorReadingRow,
  OperatorSensorTrustTone,
} from "@/lib/operatorAccountReadModelsViewModel";
import type {
  OperatorConfirmedRootZoneApplicationRow,
  OperatorWateringContextViewModel,
} from "@/lib/operatorWateringContextViewModel";

export interface OperatorAccountReadModelsPanelProps {
  model: OperatorAccountReadModelsPanelModel;
}

function readableTimestamp(value: string | null): string {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Time unavailable";
  return date.toLocaleString();
}

function trustToneClass(tone: OperatorSensorTrustTone): string {
  switch (tone) {
    case "current":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "invalid":
      return "border-destructive/50 bg-destructive/10 text-destructive";
    case "caution":
      return "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    default:
      return "border-border bg-secondary/30 text-muted-foreground";
  }
}

function LoadingRows({ testId }: { testId: string }) {
  return (
    <div className="space-y-2" data-testid={testId} aria-label="Loading account data">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function DiaryPanel({ state }: { state: OperatorPanelCollectionState<OperatorDiaryEntryRow> }) {
  return (
    <Card data-testid="operator-account-diary-card">
      <CardHeader>
        <CardTitle className="text-base">Recent diary entries</CardTitle>
        <CardDescription>
          <code>list_recent_diary_entries</code> · newest first · owner-scoped
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === "idle" || state.status === "loading" ? (
          <LoadingRows testId="operator-account-diary-loading" />
        ) : state.status === "unavailable" ? (
          <p
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground"
            data-testid="operator-account-diary-unavailable"
          >
            Recent diary entries are unavailable. Verdant cannot confirm this grow is empty.
          </p>
        ) : state.status === "empty" ? (
          <p className="text-sm text-muted-foreground" data-testid="operator-account-diary-empty">
            No recent diary entries yet.
          </p>
        ) : (
          <ol className="space-y-2" data-testid="operator-account-diary-list">
            {state.items.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{entry.stageLabel}</Badge>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={entry.entryAt ?? undefined}
                  >
                    {readableTimestamp(entry.entryAt)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{entry.note}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function SensorPanel({
  state,
  tentName,
}: {
  state: OperatorPanelSensorState;
  tentName: string | null;
}) {
  return (
    <Card data-testid="operator-account-sensor-card">
      <CardHeader>
        <CardTitle className="text-base">Latest sensor snapshot</CardTitle>
        <CardDescription>
          <code>get_latest_sensor_snapshot</code> · latest eligible row per metric
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.status === "no_tent" ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="operator-account-sensor-no-tent"
          >
            No active tent in this grow. Add or select a tent before loading a sensor snapshot.
          </p>
        ) : state.status === "idle" || state.status === "loading" ? (
          <LoadingRows testId="operator-account-sensor-loading" />
        ) : state.status === "unavailable" ? (
          <p
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground"
            data-testid="operator-account-sensor-unavailable"
          >
            Sensor snapshot unavailable. Verdant cannot confirm this tent has no readings.
          </p>
        ) : state.status === "empty" ? (
          <p className="text-sm text-muted-foreground" data-testid="operator-account-sensor-empty">
            No sensor readings yet for this tent.
          </p>
        ) : (
          <div className="space-y-3">
            {tentName ? (
              <p className="text-xs text-muted-foreground" data-testid="operator-account-tent-name">
                Tent: {tentName}
              </p>
            ) : null}
            <dl className="grid gap-2 sm:grid-cols-2" data-testid="operator-account-sensor-list">
              {state.items.map((reading) => (
                <div
                  key={reading.id}
                  className="rounded-lg border border-border/60 bg-secondary/20 p-3"
                  data-current-live={reading.currentLive ? "true" : "false"}
                >
                  <dt className="text-xs font-medium text-muted-foreground">
                    {reading.metricLabel}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">{reading.valueLabel}</dd>
                  <dd className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <Badge variant="outline">Source: {reading.sourceLabel}</Badge>
                    <Badge variant="outline">Quality: {reading.qualityLabel}</Badge>
                    <Badge variant="outline">Freshness: {reading.freshnessLabel}</Badge>
                    <Badge variant="outline" className={trustToneClass(reading.trustTone)}>
                      {reading.currentLive ? "Current live" : "Context only"}
                    </Badge>
                  </dd>
                  <dd className="mt-2 text-xs text-muted-foreground">
                    <time dateTime={reading.capturedAt ?? undefined}>
                      Captured {readableTimestamp(reading.capturedAt)}
                    </time>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RootZoneApplicationSummary({
  application,
  emptyCopy,
  label,
  testId,
}: {
  application: OperatorConfirmedRootZoneApplicationRow | null;
  emptyCopy: string;
  label: "Last plain water" | "Last feed";
  testId: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20 p-3" data-testid={testId}>
      <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
      {application ? (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <time dateTime={application.occurredAt}>{readableTimestamp(application.occurredAt)}</time>
          <Badge variant="outline">{application.sourceLabel}</Badge>
        </div>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">{emptyCopy}</p>
      )}
    </div>
  );
}

function WateringContextPanel({
  model,
  tentName,
}: {
  model: OperatorWateringContextViewModel;
  tentName: string | null;
}) {
  return (
    <Card data-testid="operator-watering-context-card">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">Watering decision context</CardTitle>
          <Badge variant="outline">Read-only evidence</Badge>
          <Badge variant="outline">Grower decides</Badge>
        </div>
        <CardDescription>
          Confirmed typed water and feed applications with source-labeled sensor context for{" "}
          {tentName ?? "the active grow"}, plus recent active-grow observations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {model.status === "loading" ? (
          <LoadingRows testId="operator-watering-context-loading" />
        ) : model.status === "unavailable" ? (
          <p
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground"
            data-testid="operator-watering-context-unavailable"
          >
            {model.summary} Verdant cannot treat unavailable evidence as an empty history.
          </p>
        ) : (
          <>
            <div className="space-y-2" data-testid="operator-watering-context-summary">
              <p className="text-sm">{model.summary}</p>
              {model.missingContext.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                  {model.missingContext.includes("typed_root_zone_history") ? (
                    <Badge variant="outline">
                      Typed root-zone application history missing or unavailable
                    </Badge>
                  ) : null}
                  {model.missingContext.includes("soil_moisture_snapshot") ? (
                    <Badge variant="outline">Soil-moisture snapshot missing or unusable</Badge>
                  ) : null}
                </div>
              ) : null}
            </div>

            <section aria-labelledby="operator-last-application-title" className="space-y-2">
              <h3
                id="operator-last-application-title"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Last root-zone application
              </h3>
              {model.lastRootZoneApplication ? (
                <div
                  className="rounded-lg border border-border/60 bg-secondary/20 p-3"
                  data-testid="operator-last-root-zone-application"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{model.lastRootZoneApplication.eventLabel}</Badge>
                    <time dateTime={model.lastRootZoneApplication.occurredAt}>
                      {readableTimestamp(model.lastRootZoneApplication.occurredAt)}
                    </time>
                    <Badge variant="outline">{model.lastRootZoneApplication.sourceLabel}</Badge>
                    {model.lastRootZoneApplication.hasRejectedMetrics ? (
                      <Badge variant="outline" className={trustToneClass("caution")}>
                        Some supplied measurements rejected
                      </Badge>
                    ) : null}
                  </div>
                  {model.lastRootZoneApplication.metrics.length > 0 ? (
                    <dl className="mt-3 flex flex-wrap gap-2">
                      {model.lastRootZoneApplication.metrics.map((metric) => (
                        <div
                          key={metric.key}
                          className="rounded-md border border-border/50 px-2 py-1 text-xs"
                        >
                          <dt className="text-muted-foreground">{metric.label}</dt>
                          <dd className="font-medium">{metric.valueLabel}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              ) : (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="operator-no-root-zone-application"
                >
                  No confirmed typed water or feed application is available for this tent.
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2" aria-label="Application type history">
                <RootZoneApplicationSummary
                  application={model.lastConfirmedWatering}
                  emptyCopy="No typed plain-water application is available."
                  label="Last plain water"
                  testId="operator-last-plain-water"
                />
                <RootZoneApplicationSummary
                  application={model.lastConfirmedFeeding}
                  emptyCopy="No typed feed application is available."
                  label="Last feed"
                  testId="operator-last-feed"
                />
              </div>
            </section>

            <section aria-labelledby="operator-root-zone-cycles-title" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3
                  id="operator-root-zone-cycles-title"
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Recent typed root-zone records ({model.recentRootZoneCycles.length})
                </h3>
                <span className="text-[11px] text-muted-foreground">Newest first · max 5</span>
              </div>
              {model.recentRootZoneCycles.length > 0 ? (
                <ol className="space-y-2" data-testid="operator-root-zone-cycle-list">
                  {model.recentRootZoneCycles.map((cycle) => (
                    <li
                      key={cycle.key}
                      className="rounded-lg border border-border/60 bg-secondary/20 p-3"
                      data-testid="operator-root-zone-cycle"
                      data-event-type={cycle.eventType}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{cycle.eventLabel}</Badge>
                        <time dateTime={cycle.occurredAt}>
                          {readableTimestamp(cycle.occurredAt)}
                        </time>
                        <Badge variant="outline">{cycle.targetLabel}</Badge>
                        <Badge variant="outline">{cycle.sourceLabel}</Badge>
                        {cycle.warnings.length > 0 ? (
                          <Badge variant="outline" className={trustToneClass("caution")}>
                            Verify record
                          </Badge>
                        ) : null}
                      </div>

                      {cycle.metrics.length > 0 ? (
                        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {cycle.metrics.map((metric) => (
                            <div
                              key={metric.key}
                              className="rounded-md border border-border/50 px-2 py-1 text-xs"
                            >
                              <dt className="text-muted-foreground">{metric.label}</dt>
                              <dd className="font-medium">{metric.valueLabel}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}

                      {cycle.nutrientLine || cycle.products.length > 0 ? (
                        <div
                          className="mt-3 space-y-2 rounded-md border border-border/50 p-2 text-xs"
                          data-testid="operator-root-zone-cycle-nutrients"
                        >
                          {cycle.nutrientLine ? (
                            <p>
                              <span className="text-muted-foreground">Recorded nutrient line:</span>{" "}
                              <span className="font-medium">{cycle.nutrientLine}</span>
                            </p>
                          ) : null}
                          {cycle.products.length > 0 ? (
                            <ul
                              className="flex flex-wrap gap-1.5"
                              aria-label="Recorded nutrient products"
                            >
                              {cycle.products.map((product, index) => (
                                <li key={`${cycle.key}-product-${index}`}>
                                  <Badge variant="outline">
                                    {product.name}
                                    {product.valueLabel ? ` · ${product.valueLabel}` : ""}
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}

                      {cycle.comparisons.length > 0 ? (
                        <dl
                          className="mt-3 flex flex-wrap gap-2"
                          aria-label="Recorded root-zone arithmetic comparisons"
                        >
                          {cycle.comparisons.map((comparison) => (
                            <div
                              key={comparison.key}
                              className="rounded-md border border-border/50 px-2 py-1 text-xs"
                            >
                              <dt className="text-muted-foreground">{comparison.label}</dt>
                              <dd className="font-medium">{comparison.valueLabel}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}

                      {cycle.warnings.length > 0 ? (
                        <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-300">
                          {cycle.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="operator-no-root-zone-cycles"
                >
                  No typed watering or feeding cycles are available for this tent.
                </p>
              )}
            </section>

            <section aria-labelledby="operator-watering-sensor-title" className="space-y-2">
              <h3
                id="operator-watering-sensor-title"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Latest sensor context
              </h3>
              {model.sensorRows.length > 0 ? (
                <dl
                  className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                  data-testid="operator-watering-sensor-list"
                >
                  {model.sensorRows.map((reading) => (
                    <div
                      key={reading.id}
                      className="rounded-lg border border-border/60 bg-secondary/20 p-3"
                      data-current-live={reading.currentLive ? "true" : "false"}
                    >
                      <dt className="text-xs font-medium text-muted-foreground">
                        {reading.metricLabel} · {reading.contextLabel}
                      </dt>
                      <dd className="mt-1 text-base font-semibold">{reading.valueLabel}</dd>
                      <dd className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        <Badge variant="outline">Source: {reading.sourceLabel}</Badge>
                        <Badge variant="outline">Quality: {reading.qualityLabel}</Badge>
                        <Badge variant="outline">Freshness: {reading.freshnessLabel}</Badge>
                        <Badge variant="outline" className={trustToneClass(reading.trustTone)}>
                          {reading.currentLive ? "Current live" : "Context only"}
                        </Badge>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p
                  className="text-sm text-muted-foreground"
                  data-testid="operator-no-watering-sensors"
                >
                  No usable watering-related sensor context is available.
                </p>
              )}
            </section>

            <section aria-labelledby="operator-watering-observations-title" className="space-y-2">
              <h3
                id="operator-watering-observations-title"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Recent active-grow observations ({model.diaryObservationCount})
              </h3>
              {model.diaryObservations.length > 0 ? (
                <ol className="space-y-2" data-testid="operator-watering-diary-list">
                  {model.diaryObservations.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-border/60 bg-secondary/20 p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{entry.stageLabel}</Badge>
                        <time
                          className="text-xs text-muted-foreground"
                          dateTime={entry.entryAt ?? undefined}
                        >
                          {readableTimestamp(entry.entryAt)}
                        </time>
                      </div>
                      <p className="mt-2">{entry.note}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No recent grower observations are available.
                </p>
              )}
            </section>

            <div
              className="space-y-1 rounded-lg border border-border/60 bg-secondary/20 p-3 text-xs text-muted-foreground"
              data-testid="operator-watering-safety-fence"
            >
              <p>{model.decisionReminder}</p>
              <p>{model.snapshotCaveat}</p>
              <p>{model.airContextCaveat}</p>
              <p>{model.cycleArithmeticCaveat}</p>
              <p>{model.nutrientEvidenceCaveat}</p>
              <p>{model.cycleScopeCaveat}</p>
              <p>{model.growerControlNote}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function OperatorAccountReadModelsPanel({
  model,
}: OperatorAccountReadModelsPanelProps) {
  return (
    <section
      className="mx-auto max-w-5xl space-y-4 px-4 pt-4"
      aria-labelledby="operator-account-read-models-title"
      data-testid="operator-account-read-models"
    >
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="operator-account-read-models-title" className="text-lg">
              Your account · read-only
            </CardTitle>
            <Badge variant="outline">Owner-scoped</Badge>
          </div>
          <CardDescription>
            Operator Mode is reading the same diary and per-metric sensor contracts exposed to
            connected agents. It performs no writes and sends no equipment commands.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {model.status === "loading" ? (
            <LoadingRows testId="operator-account-scope-loading" />
          ) : model.status === "unavailable" ? (
            <p className="text-sm text-muted-foreground" data-testid="operator-account-scope-error">
              Your account scope is unavailable. Verdant cannot show or infer another account's
              data.
            </p>
          ) : model.status === "no_grow" ? (
            <div className="space-y-2 text-sm" data-testid="operator-account-no-grow">
              <p className="text-muted-foreground">
                No active grow yet. Create or select a grow to load recent diary entries.
              </p>
              <Link className="text-primary hover:underline" to="/grows">
                Open grows →
              </Link>
            </div>
          ) : (
            <p className="text-sm" data-testid="operator-account-grow-name">
              Active grow: <span className="font-medium">{model.growName}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {model.status === "ready" ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <DiaryPanel state={model.diary} />
            <SensorPanel state={model.sensor} tentName={model.tentName} />
          </div>
          <WateringContextPanel model={model.watering} tentName={model.tentName} />
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground" data-testid="operator-account-trust-note">
        “Current live” requires a fresh timestamp, source <code>live</code>, and quality{" "}
        <code>ok</code>. Manual, CSV, demo, stale, invalid, degraded, or unknown readings remain
        labeled context only.
      </p>
    </section>
  );
}
