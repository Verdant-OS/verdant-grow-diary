/**
 * EnvironmentRibbon — presenter for the 24-hour environment ribbon.
 *
 * Renders temp / RH / VPD over the window with a provenance band underneath
 * that shows, as time, where every reading came from (live | manual | csv |
 * demo | stale | invalid | none). All classification lives in
 * `src/lib/environmentRibbonViewModel.ts`; this file draws and nothing else.
 *
 * - No fetches, no writes, no timers. `now` is injected by the caller.
 * - Invalid buckets draw no value and break the VPD line — never a number.
 * - Every displayed reading is paired with its source label.
 */

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  buildEnvironmentRibbonViewModel,
  formatBucketClock,
  RIBBON_SOURCE_EXPLANATION,
  VPD_BAND_STATUS_LABEL,
  type EnvironmentRibbonReadingLike,
  type RibbonBucket,
  type RibbonSource,
  type VpdTargetBand,
} from "@/lib/environmentRibbonViewModel";
import {
  convertCelsiusForDisplay,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";
import { useTemperatureUnitPreference } from "@/hooks/useTemperatureUnitPreference";

export interface EnvironmentRibbonProps {
  readings: readonly EnvironmentRibbonReadingLike[] | null | undefined;
  /** Injected clock. Callers pass `Date.now()` (or a fixed value in tests). */
  now: number | string | Date;
  targetVpd?: VpdTargetBand | null;
  title?: string;
  /** Minutes east of UTC for clock labels. Defaults to the browser's offset. */
  utcOffsetMinutes?: number;
  /** Overrides the stored preference; used by tests and previews. */
  temperatureUnit?: TemperatureUnitPreference;
  testIdPrefix?: string;
}

const W = 1120;
const L = 44;
const R = 36;
const TOP = 16;
const PLOT_H = 196;
const BAND_Y = 236;
const BAND_H = 14;
const H = 286;
const TEMP_MIN = 15;
const TEMP_MAX = 35;
const VPD_MIN = 0;
const VPD_MAX = 2.5;

const SOURCE_FILL: Record<RibbonSource, string> = {
  live: "hsl(var(--source-live))",
  manual: "hsl(var(--source-manual))",
  csv: "hsl(var(--source-csv))",
  demo: "hsl(var(--source-demo))",
  stale: "hsl(var(--source-stale))",
  invalid: "hsl(var(--source-invalid))",
  none: "hsl(var(--source-none))",
};

const LEGEND: RibbonSource[] = ["live", "manual", "csv", "demo", "stale", "invalid"];

function formatTemp(tempC: number | null, unit: TemperatureUnitPreference): string {
  const v = convertCelsiusForDisplay(tempC, unit);
  if (v == null) return "—";
  return `${v.toFixed(1)} ${unit === "fahrenheit" ? "°F" : "°C"}`;
}

function formatRh(rh: number | null): string {
  return rh == null ? "—" : `${Math.round(rh)} %`;
}

function formatVpd(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)} kPa`;
}

export default function EnvironmentRibbon({
  readings,
  now,
  targetVpd = null,
  title = "Last 24 hours",
  utcOffsetMinutes,
  temperatureUnit,
  testIdPrefix = "environment-ribbon",
}: EnvironmentRibbonProps) {
  const storedUnit = useTemperatureUnitPreference();
  const unit = temperatureUnit ?? storedUnit;
  const offset = utcOffsetMinutes ?? -new Date().getTimezoneOffset();
  const titleId = useId();

  const vm = useMemo(
    () => buildEnvironmentRibbonViewModel({ readings, now, targetVpd }),
    [readings, now, targetVpd],
  );
  const [hover, setHover] = useState<number | null>(null);

  const n = vm.buckets.length;
  const x = (i: number) => L + (n <= 1 ? 0 : (i / (n - 1)) * (W - L - R));
  const yT = (v: number) => TOP + PLOT_H - ((v - TEMP_MIN) / (TEMP_MAX - TEMP_MIN)) * PLOT_H;
  const yV = (v: number) => TOP + PLOT_H - ((v - VPD_MIN) / (VPD_MAX - VPD_MIN)) * PLOT_H;

  const tempPath = useMemo(() => {
    let d = "";
    let open = false;
    for (const b of vm.buckets) {
      if (b.tempC == null) {
        open = false;
        continue;
      }
      d += `${open ? "L" : "M"}${x(b.index).toFixed(1)} ${yT(b.tempC).toFixed(1)} `;
      open = true;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm]);

  const vpdPath = useMemo(() => {
    let d = "";
    let open = false;
    for (const b of vm.buckets) {
      if (b.vpdKpa == null) {
        open = false;
        continue;
      }
      d += `${open ? "L" : "M"}${x(b.index).toFixed(1)} ${yV(b.vpdKpa).toFixed(1)} `;
      open = true;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vm]);

  const focus: RibbonBucket | null =
    hover != null
      ? (vm.buckets[hover] ?? null)
      : vm.latest
        ? (vm.buckets[vm.latest.bucketIndex] ?? null)
        : null;

  const bandStatus = vm.latest?.vpdBandStatus ?? "unknown";

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const base = hover ?? vm.latest?.bucketIndex ?? n - 1;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHover(Math.max(0, base - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setHover(Math.min(n - 1, base + 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHover(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHover(n - 1);
    } else if (e.key === "Escape") {
      setHover(null);
    }
  };

  const hourTicks: number[] = [];
  for (let h = 0; h <= 24; h += 3) hourTicks.push(Math.min(n - 1, Math.round((h / 24) * n)));

  return (
    <section
      aria-labelledby={titleId}
      data-testid={testIdPrefix}
      data-latest-source={vm.latest?.source ?? "none"}
      className="rounded-2xl border border-border/40 bg-card/60 p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h3 id={titleId} className="font-display text-lg font-semibold">
          {title}
        </h3>
        {focus ? (
          <dl className="flex flex-wrap gap-6" data-testid={`${testIdPrefix}-now`}>
            <div>
              <dd className="text-2xl font-semibold tabular-nums leading-none">
                {formatTemp(focus.tempC, unit)}
              </dd>
              <dt className="mt-1 text-xs text-muted-foreground">Air temp</dt>
              <SourceChip source={focus.source} testId={`${testIdPrefix}-temp-source`} />
            </div>
            <div>
              <dd className="text-2xl font-semibold tabular-nums leading-none">
                {formatRh(focus.rhPct)}
              </dd>
              <dt className="mt-1 text-xs text-muted-foreground">Humidity</dt>
              <SourceChip source={focus.source} testId={`${testIdPrefix}-rh-source`} />
            </div>
            <div>
              <dd className="text-2xl font-semibold tabular-nums leading-none">
                {formatVpd(focus.vpdKpa)}
              </dd>
              <dt className="mt-1 text-xs text-muted-foreground">VPD</dt>
              <span
                className="mt-0.5 flex items-center gap-1.5 text-xs"
                data-testid={`${testIdPrefix}-vpd-status`}
              >
                <i
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    background:
                      focus.vpdKpa == null
                        ? SOURCE_FILL.invalid
                        : bandStatus === "in_band"
                          ? "hsl(var(--success))"
                          : bandStatus === "unknown"
                            ? SOURCE_FILL.demo
                            : SOURCE_FILL.stale,
                  }}
                />
                {focus.vpdKpa == null
                  ? "not computed"
                  : hover == null
                    ? VPD_BAND_STATUS_LABEL[bandStatus]
                    : formatBucketClock(focus.endMs, offset)}
              </span>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid={`${testIdPrefix}-empty`}>
            No readings in the last 24 hours. Add a manual reading or connect a sensor.
          </p>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 block w-full select-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="img"
        tabIndex={0}
        aria-label={`Environment ribbon for the last 24 hours. Use arrow keys to move across readings. Latest source: ${vm.latest?.source ?? "none"}.`}
        data-testid={`${testIdPrefix}-svg`}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
      >
        {targetVpd &&
        Number.isFinite(targetVpd.minKpa) &&
        Number.isFinite(targetVpd.maxKpa) &&
        targetVpd.minKpa <= targetVpd.maxKpa ? (
          <rect
            x={L}
            y={yV(targetVpd.maxKpa)}
            width={W - L - R}
            height={Math.max(0, yV(targetVpd.minKpa) - yV(targetVpd.maxKpa))}
            fill="hsl(var(--success))"
            opacity={0.12}
            data-testid={`${testIdPrefix}-target-band`}
          />
        ) : null}

        {hourTicks.map((i, k) => (
          <g key={k}>
            <line
              x1={x(i)}
              x2={x(i)}
              y1={TOP}
              y2={TOP + PLOT_H}
              stroke="hsl(var(--border))"
              strokeWidth={1}
            />
            <text
              x={x(i)}
              y={BAND_Y + BAND_H + 22}
              fontSize={12}
              fill="hsl(var(--muted-foreground))"
              textAnchor="middle"
            >
              {formatBucketClock(vm.buckets[i]?.startMs ?? vm.windowStartMs, offset)}
            </text>
          </g>
        ))}

        <text
          x={L - 8}
          y={yT(30) + 4}
          fontSize={12}
          fill="hsl(var(--muted-foreground))"
          textAnchor="end"
        >
          {unit === "fahrenheit" ? "86°" : "30°"}
        </text>
        <text
          x={L - 8}
          y={yT(20) + 4}
          fontSize={12}
          fill="hsl(var(--muted-foreground))"
          textAnchor="end"
        >
          {unit === "fahrenheit" ? "68°" : "20°"}
        </text>
        <text x={W - R + 4} y={yV(2) + 4} fontSize={12} fill="hsl(var(--muted-foreground))">
          2.0
        </text>
        <text x={W - R + 4} y={yV(1) + 4} fontSize={12} fill="hsl(var(--muted-foreground))">
          1.0
        </text>

        <path
          d={tempPath}
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={1.5}
          strokeDasharray="3 3"
          opacity={0.8}
          data-testid={`${testIdPrefix}-temp-path`}
        />
        <path
          d={vpdPath}
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeWidth={2.25}
          strokeLinejoin="round"
          data-testid={`${testIdPrefix}-vpd-path`}
        />

        {vm.runs.map((run) => (
          <rect
            key={`${run.source}-${run.startIndex}`}
            x={x(run.startIndex)}
            y={BAND_Y}
            width={Math.max(1, x(Math.min(n - 1, run.endIndex + 1)) - x(run.startIndex))}
            height={BAND_H}
            fill={SOURCE_FILL[run.source]}
            data-testid={`${testIdPrefix}-run`}
            data-source={run.source}
          >
            <title>
              {run.source}: {formatBucketClock(vm.buckets[run.startIndex].startMs, offset)}–
              {formatBucketClock(vm.buckets[run.endIndex].endMs, offset)}
            </title>
          </rect>
        ))}
        <text
          x={L - 8}
          y={BAND_Y + 11}
          fontSize={11.5}
          fill="hsl(var(--muted-foreground))"
          textAnchor="end"
        >
          source
        </text>

        {hover != null && vm.buckets[hover] ? (
          <g data-testid={`${testIdPrefix}-cursor`}>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={TOP}
              y2={BAND_Y + BAND_H}
              stroke="hsl(var(--foreground))"
              strokeWidth={1}
            />
            {vm.buckets[hover].vpdKpa != null ? (
              <circle
                cx={x(hover)}
                cy={yV(vm.buckets[hover].vpdKpa as number)}
                r={4.5}
                fill="hsl(var(--foreground))"
              />
            ) : null}
          </g>
        ) : null}
      </svg>

      <p
        className="mt-1 min-h-5 text-xs text-muted-foreground"
        data-testid={`${testIdPrefix}-readout`}
        aria-live="polite"
      >
        {hover != null && vm.buckets[hover] ? (
          <>
            <span className="font-medium text-foreground">
              {formatBucketClock(vm.buckets[hover].endMs, offset)}
            </span>
            {" — "}
            {formatTemp(vm.buckets[hover].tempC, unit)}, {formatRh(vm.buckets[hover].rhPct)}, VPD{" "}
            {formatVpd(vm.buckets[hover].vpdKpa)} · source{" "}
            <span className="font-medium text-foreground">{vm.buckets[hover].source}</span> (
            {RIBBON_SOURCE_EXPLANATION[vm.buckets[hover].source]})
          </>
        ) : (
          "Move across the ribbon or use the arrow keys to read any point and where it came from."
        )}
      </p>

      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <i
              aria-hidden="true"
              className="inline-block h-2 w-4 rounded-sm"
              style={{ background: SOURCE_FILL[s] }}
            />
            {s}
            {vm.counts[s] > 0 ? (
              <span className="tabular-nums" data-testid={`${testIdPrefix}-count-${s}`}>
                {vm.counts[s]}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SourceChip({ source, testId }: { source: RibbonSource; testId: string }) {
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-xs" data-testid={testId}>
      <i
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: SOURCE_FILL[source] }}
      />
      {source === "invalid" ? "invalid, excluded" : source}
    </span>
  );
}
