/**
 * PhenoRadar — a tiny 5-axis radar of the James Loud scorecard, so a pheno's
 * strengths read as a SHAPE, not just a number. Pure SVG, theme-aware, no I/O.
 *
 * It's a glance aid, never a verdict: it draws the same axes the score is built
 * from (nose / resin / structure / yield / breeding), each 0–10.
 */
import { cn } from "@/lib/utils";
import type { AxisKey } from "@/lib/phenoContendersViewModel";

const RADAR_AXES: readonly { key: AxisKey; short: string }[] = [
  { key: "nose", short: "N" },
  { key: "resin", short: "R" },
  { key: "structure", short: "S" },
  { key: "yield", short: "Y" },
  { key: "breeding", short: "B" },
];

export interface PhenoRadarProps {
  readonly values: Record<AxisKey, number>;
  readonly size?: number;
  /** Keeper radars fill emerald; everything else a calm sky. */
  readonly tone?: "keeper" | "muted";
  readonly className?: string;
}

const CX = 50;
const CY = 50;
const R = 33;

function clamp10(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, n));
}

/** Vertex i (0=top, clockwise) at a given radius. */
function vertex(i: number, radius: number): [number, number] {
  const angle = ((-90 + i * 72) * Math.PI) / 180;
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

function points(pts: readonly [number, number][]): string {
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export default function PhenoRadar({
  values,
  size = 66,
  tone = "muted",
  className,
}: PhenoRadarProps) {
  const outer = RADAR_AXES.map((_, i) => vertex(i, R));
  const mid = RADAR_AXES.map((_, i) => vertex(i, R * 0.5));
  const data = RADAR_AXES.map((ax, i) => vertex(i, R * (clamp10(values[ax.key]) / 10)));

  const strokeCls = tone === "keeper" ? "stroke-emerald-500" : "stroke-sky-500";
  const fillCls = tone === "keeper" ? "fill-emerald-500/25" : "fill-sky-500/20";
  const dotCls = tone === "keeper" ? "fill-emerald-500" : "fill-sky-500";

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Loud scorecard radar"
      data-testid="pheno-radar"
    >
      {/* grid: two rings + spokes */}
      <polygon points={points(outer)} className="fill-none stroke-border" strokeWidth={1} />
      <polygon points={points(mid)} className="fill-none stroke-border" strokeWidth={0.75} />
      {outer.map(([x, y], i) => (
        <line key={i} x1={CX} y1={CY} x2={x} y2={y} className="stroke-border" strokeWidth={0.75} />
      ))}

      {/* data polygon + vertices */}
      <polygon
        points={points(data)}
        className={cn(fillCls, strokeCls)}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {data.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.5} className={dotCls} />
      ))}

      {/* axis initials */}
      {RADAR_AXES.map((ax, i) => {
        const [x, y] = vertex(i, R + 9);
        return (
          <text
            key={ax.key}
            x={x}
            y={y}
            className="fill-muted-foreground"
            fontSize={9}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {ax.short}
          </text>
        );
      })}
    </svg>
  );
}
