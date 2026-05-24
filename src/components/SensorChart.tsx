import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { SensorReading } from "@/mock";
import { format } from "date-fns";

interface Props {
  data: SensorReading[];
  metric: "temp" | "rh" | "vpd" | "co2" | "soil";
  height?: number;
  variant?: "area" | "line";
}

const meta = {
  temp: { label: "Temperature", unit: "°F", color: "hsl(var(--warning))" },
  rh:   { label: "Humidity",    unit: "%",  color: "hsl(var(--info))" },
  vpd:  { label: "VPD",         unit: " kPa", color: "hsl(var(--primary))" },
  co2:  { label: "CO₂",         unit: " ppm", color: "hsl(var(--leaf-glow))" },
  soil: { label: "Soil",        unit: "%",  color: "hsl(var(--accent))" },
};

export default function SensorChart({ data, metric, height = 220, variant = "area" }: Props) {
  const m = meta[metric];
  // Temperature is stored in Celsius; render Fahrenheit per Verdant convention.
  const chartData = data.map((r) => {
    const raw = r[metric];
    const v = metric === "temp" && typeof raw === "number" ? raw * 9 / 5 + 32 : raw;
    return { ts: r.ts, value: v };
  });
  const Comp = (variant === "area" ? AreaChart : LineChart) as React.ComponentType<React.ComponentProps<typeof AreaChart>>;
  const Series = (variant === "area" ? Area : Line) as React.ComponentType<React.ComponentProps<typeof Area>>;
  const id = `grad-${metric}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Comp data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} width={36} tickFormatter={(v) => `${v}${m.unit.replace(/^\s/, "")}`} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          labelFormatter={(v) => format(new Date(v as string), "PPpp")}
          formatter={(v: number) => [`${v}${m.unit}`, m.label]}
        />
        <Series type="monotone" dataKey="value" stroke={m.color} strokeWidth={2} fill={`url(#${id})`} dot={false} />
      </Comp>
    </ResponsiveContainer>
  );
}
