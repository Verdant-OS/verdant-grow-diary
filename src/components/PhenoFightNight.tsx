/**
 * PhenoFightNight — presenter for the pure phenoFightViewModel.
 *
 * Pit any two contenders head to head, trait by trait, as a diverging tug-of-war:
 * side A (emerald) reaches out to the left, side B (fuchsia) to the right, and
 * the longer bar has the edge on that trait. Each corner is a picker, so the
 * grower chooses the matchup; a tally sums the trait edges.
 *
 * Ethos: it stages the duel; it does NOT crown a winner. "The call" is a local,
 * unsaved control — in a live hunt the app records the grower's decision, it
 * never picks for them. Presentational + local UI state only: no I/O, no writes.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buildFight, type FightSide, type FightAxis } from "@/lib/phenoFightViewModel";
import type { ContenderInput } from "@/lib/phenoContendersViewModel";

export interface PhenoFightNightProps {
  /** The pickable pool (typically the hunt's non-culls). */
  readonly pool: readonly ContenderInput[];
  readonly defaultAId?: string | number;
  readonly defaultBId?: string | number;
  readonly className?: string;
}

type Call = "a" | "b" | "tie" | null;

function SidePicker({
  pool,
  side,
  value,
  otherValue,
  onChange,
  align,
}: {
  pool: readonly ContenderInput[];
  side: FightSide;
  value: string;
  otherValue: string;
  onChange: (id: string) => void;
  align: "left" | "right";
}) {
  const accent =
    align === "left"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-fuchsia-600 dark:text-fuchsia-400";
  const testid = align === "left" ? "pheno-fight-side-a" : "pheno-fight-side-b";
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")} data-testid={testid}>
      <select
        aria-label={align === "left" ? "Side A" : "Side B"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "max-w-full cursor-pointer truncate rounded-md border border-border bg-card px-2 py-1 text-sm font-semibold outline-none focus:ring-2 focus:ring-ring",
          accent,
        )}
      >
        {pool.map((p) => (
          <option
            key={p.id}
            value={String(p.id)}
            disabled={String(p.id) === otherValue}
            className="bg-background text-foreground"
          >
            {p.name}
          </option>
        ))}
      </select>
      <div className={cn("mt-1 flex items-center gap-1.5", align === "right" && "justify-end")}>
        <Badge
          variant="outline"
          className="border-border bg-secondary text-[9px] uppercase text-muted-foreground"
        >
          {side.verdict}
        </Badge>
        <span className="text-[11px] text-muted-foreground">
          Loud <span className="font-semibold text-foreground">{side.score}</span>
        </span>
      </div>
    </div>
  );
}

function AxisRow({ axis }: { axis: FightAxis }) {
  const aWins = axis.edge === "a";
  const bWins = axis.edge === "b";
  return (
    <div
      data-testid={`pheno-fight-axis-${axis.key}`}
      className="grid grid-cols-[1fr_5rem_1fr] items-center gap-2 py-1"
    >
      {/* Side A — number then a bar reaching in from the left */}
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "w-4 shrink-0 text-right tabular-nums text-[11px]",
            aWins
              ? "font-semibold text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground",
          )}
        >
          {axis.aValue}
        </span>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "absolute right-0 top-0 h-full rounded-full",
              aWins ? "bg-emerald-500" : "bg-emerald-500/45",
            )}
            style={{ width: `${axis.aValue * 10}%` }}
          />
        </div>
      </div>

      {/* Trait label + weight */}
      <div className="text-center">
        <div className="text-[10px] uppercase leading-tight tracking-wide text-muted-foreground">
          {axis.label}
        </div>
        <div className="text-[9px] leading-tight text-muted-foreground/70">{axis.weightPct}%</div>
      </div>

      {/* Side B — a bar reaching in from the right, then the number */}
      <div className="flex items-center gap-1.5">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "absolute left-0 top-0 h-full rounded-full",
              bWins ? "bg-fuchsia-500" : "bg-fuchsia-500/45",
            )}
            style={{ width: `${axis.bValue * 10}%` }}
          />
        </div>
        <span
          className={cn(
            "w-4 shrink-0 tabular-nums text-[11px]",
            bWins
              ? "font-semibold text-fuchsia-600 dark:text-fuchsia-400"
              : "text-muted-foreground",
          )}
        >
          {axis.bValue}
        </span>
      </div>
    </div>
  );
}

function firstTwoIds(
  pool: readonly ContenderInput[],
  defaultAId?: string | number,
  defaultBId?: string | number,
): [string, string] {
  const ids = pool.map((p) => String(p.id));
  const a = defaultAId != null && ids.includes(String(defaultAId)) ? String(defaultAId) : ids[0];
  let b = defaultBId != null && ids.includes(String(defaultBId)) ? String(defaultBId) : ids[1];
  if (b === a) b = ids.find((id) => id !== a) ?? ids[1];
  return [a, b];
}

export default function PhenoFightNight({
  pool,
  defaultAId,
  defaultBId,
  className,
}: PhenoFightNightProps) {
  const [initialA, initialB] = firstTwoIds(pool, defaultAId, defaultBId);
  const [aId, setAId] = useState(initialA);
  const [bId, setBId] = useState(initialB);
  const [call, setCall] = useState<Call>(null);

  const aInput = pool.find((p) => String(p.id) === aId) ?? pool[0];
  const bInput = pool.find((p) => String(p.id) === bId) ?? pool[1];
  const fight = buildFight(aInput, bInput);
  if (!fight) return null;
  const { a, b, axes, ties } = fight;

  // Changing the matchup clears a stale call.
  const pick = (setter: (id: string) => void) => (id: string) => {
    setter(id);
    setCall(null);
  };

  const callButton = (value: Exclude<Call, null>, label: string, accent: string) => {
    const active = call === value;
    return (
      <button
        type="button"
        data-testid={`pheno-fight-call-${value}`}
        aria-pressed={active}
        onClick={() => setCall((c) => (c === value ? null : value))}
        className={cn(
          "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
          active ? accent : "border-border bg-card text-muted-foreground hover:bg-secondary",
        )}
      >
        {label}
      </button>
    );
  };

  return (
    <section
      data-testid="pheno-fight"
      aria-label="Fight night"
      className={cn("rounded-lg border border-border bg-card p-4", className)}
    >
      {/* Two corners (pickers) + VS */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <SidePicker
          pool={pool}
          side={a}
          value={aId}
          otherValue={bId}
          onChange={pick(setAId)}
          align="left"
        />
        <span className="mt-1.5 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          vs
        </span>
        <SidePicker
          pool={pool}
          side={b}
          value={bId}
          otherValue={aId}
          onChange={pick(setBId)}
          align="right"
        />
      </div>

      <div className="mt-3 space-y-0.5 border-t border-border/60 pt-3">
        {axes.map((axis) => (
          <AxisRow key={axis.key} axis={axis} />
        ))}
      </div>

      {/* Trait tally — informational, not a verdict */}
      <div
        data-testid="pheno-fight-tally"
        className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-md bg-secondary/40 px-3 py-2 text-[11px]"
      >
        <span className="text-emerald-600 dark:text-emerald-400">
          {a.name} leads <span className="font-semibold">{a.axisWins}</span>
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span className="text-muted-foreground">
          {ties} tie{ties === 1 ? "" : "s"}
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span className="text-fuchsia-600 dark:text-fuchsia-400">
          {b.name} leads <span className="font-semibold">{b.axisWins}</span>
        </span>
      </div>

      {/* The call — the grower's, not the app's */}
      <div
        data-testid="pheno-fight-call"
        className="mt-3 flex flex-wrap items-center justify-center gap-2"
      >
        <span className="text-[11px] font-medium text-muted-foreground">The call:</span>
        {callButton(
          "a",
          `${a.name} wins`,
          "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        )}
        {callButton("tie", "Too close", "border-border bg-secondary text-foreground")}
        {callButton(
          "b",
          `${b.name} wins`,
          "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
        )}
      </div>

      <p
        data-testid="pheno-fight-caveat"
        className="mt-3 rounded-md border-l-2 border-fuchsia-500/50 bg-secondary/30 px-3 py-2 text-[11px] text-muted-foreground"
      >
        Fight night stages the comparison — the tally and Loud scores inform, they don't decide. You
        make the call at the cure. (Demo — your pick isn't saved; a live hunt records your decision,
        it never picks for you.)
      </p>
    </section>
  );
}
