import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { SensorReading } from "@/mock";
import { format } from "date-fns";
import {
  SENSOR_CHART_METRIC_META,
  SENSOR_CHART_LEFT_MARGIN,
  formatSensorChartYTick,
  formatSensorChartTooltipValue,
} from "@/lib/sensorChartAxisRules";
import {
  SENSOR_CHART_TIME_RANGES,
  filterTimeSeriesByRange,
  formatChartTooltipTimestamp,
  type SensorChartTimeRange,
} from "@/lib/sensorChartTimeRange";
import { buildSensorReadingsCsv, downloadTextFile } from "@/lib/sensorChartExport";

interface Props {
  data: SensorReading[];
  metric: "temp" | "rh" | "vpd" | "co2" | "soil";
  height?: number;
  variant?: "area" | "line";
  /** Hide the built-in 7d/30d/90d/All selector (default: shown). */
  hideRangeSelector?: boolean;
  /** Hide the CSV export button (default: shown). */
  hideExportButton?: boolean;
  /** Initial selected range. Default "all" preserves prior behavior. */
  defaultRange?: SensorChartTimeRange;
}

// Legacy metric meta — kept inline so unit/color stay close to the chart
// markup. Tick widths and tick formatting are sourced from
// sensorChartAxisRules so AUD-006 fixes stay in one place.
const meta = {
  temp: { label: "Temperature", unit: "°F", color: "hsl(var(--warning))" },
  rh:   { label: "Humidity",    unit: "%",  color: "hsl(var(--info))" },
  vpd:  { label: "VPD",         unit: " kPa", color: "hsl(var(--primary))" },
  co2:  { label: "CO₂",         unit: " ppm", color: "hsl(var(--leaf-glow))" },
  soil: { label: "Soil",        unit: "%",  color: "hsl(var(--accent))" },
};

export default function SensorChart({
  data,
  metric,
  height = 220,
  variant = "area",
  hideRangeSelector = false,
  hideExportButton = false,
  defaultRange = "all",
}: Props) {
  const m = meta[metric];
  const axisMeta = SENSOR_CHART_METRIC_META[metric];
  const [range, setRange] = useState<SensorChartTimeRange>(defaultRange);

  // Filter + sort ascending (oldest → newest) via shared helpers so the
  // line always flows left-to-right regardless of caller order or DB
  // query direction. See src/lib/sensorChartTimeRange.ts.
  const filteredData = useMemo(
    () => filterTimeSeriesByRange(data, range, (r) => r.ts),
    [data, range],
  );

  const chartData = useMemo(() => {
    return filteredData.map((r) => {
      const raw = r[metric];
      const v = metric === "temp" && typeof raw === "number" ? raw * 9 / 5 + 32 : raw;
      return { ts: r.ts, value: v };
    });
  }, [filteredData, metric]);

  const handleExport = () => {
    const csv = buildSensorReadingsCsv(filteredData);
    const filename = `sensor-readings-${metric}-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadTextFile(csv, filename);
  };

  const Comp = (variant === "area" ? AreaChart : LineChart) as React.ComponentType<React.ComponentProps<typeof AreaChart>>;
  const Series = (variant === "area" ? Area : Line) as React.ComponentType<React.ComponentProps<typeof Area>>;
  const id = `grad-${metric}`;
  return (
    <div className="w-full">
      {(!hideRangeSelector || !hideExportButton) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {!hideExportButton && (
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              title="Download CSV for current range"
              data-testid="sensor-chart-export-btn"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
          {!hideRangeSelector && (
            <div
              role="radiogroup"
              aria-label="Chart time range"
              data-testid="sensor-chart-range-selector"
              className="flex gap-1"
            >
              {SENSOR_CHART_TIME_RANGES.map((r) => {
                const selected = r.value === range;
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRange(r.value)}
                    className={
                      "rounded-md border px-2 py-1 text-xs transition-colors " +
                      (selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:text-foreground")
                    }
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <Comp data={chartData} margin={{ top: 8, right: 12, left: SENSOR_CHART_LEFT_MARGIN, bottom: 0 }}>
          {variant === "area" && (
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={m.color} stopOpacity={0.4} />
                <stop offset="100%" stopColor={m.color} stopOpacity={0} />
              </linearGradient>
            </defs>
          )}
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} vertical={false} />
          <XAxis dataKey="ts" tickFormatter={(v) => format(new Date(v), "MMM d")} stroke="hsl(var(--muted-foreground))" fontSize={11} tickMargin={6} minTickGap={32} />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            width={axisMeta.yAxisWidth}
            tickMargin={4}
            tickFormatter={(v: number) => formatSensorChartYTick(v, metric)}
          />
          <Tooltip
            contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(v) => formatChartTooltipTimestamp(v as string)}
            formatter={(v: number) => [formatSensorChartTooltipValue(v, metric), m.label]}
          />
          <Series type="monotone" dataKey="value" stroke={m.color} strokeWidth={2} fill={`url(#${id})`} dot={false} />
        </Comp>
      </ResponsiveContainer>
    </div>
  );
}
