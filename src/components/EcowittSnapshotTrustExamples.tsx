/**
 * EcowittSnapshotTrustExamples — operator-only sample section that
 * demonstrates how Verdant renders trust badges vs Ecowitt provider
 * identity for accepted/stale/invalid Ecowitt snapshots.
 *
 * Read-only. Creates no readings. Writes nothing. Uses the shared
 * `sensorSnapshotTrustBadgeRules` so JSX never duplicates the trust
 * table.
 */

import SnapshotTrustBadge from "@/components/SnapshotTrustBadge";
import { classifySnapshotTrustBadge } from "@/lib/sensorSnapshotTrustBadgeRules";

const SAMPLES = [
  {
    key: "accepted",
    input: { resolverStatus: "fresh_live" as const, source: "ecowitt" },
    title: "Accepted fresh Ecowitt snapshot",
    body: "Fresh validated reading. Safe to use as current context.",
  },
  {
    key: "stale",
    input: { resolverStatus: "stale" as const, source: "ecowitt" },
    title: "Stale Ecowitt snapshot",
    body: "Reading is too old to treat as current.",
  },
  {
    key: "invalid",
    input: { resolverStatus: "invalid" as const, source: "ecowitt" },
    title: "Invalid Ecowitt snapshot",
    body: "Reading failed validation and will not be attached as healthy live context.",
  },
];

export default function EcowittSnapshotTrustExamples() {
  return (
    <section
      data-testid="ecowitt-snapshot-trust-examples"
      aria-label="Ecowitt snapshot trust examples"
      className="rounded-lg border border-border/60 bg-card p-4 space-y-3"
    >
      <header>
        <h3 className="text-sm font-semibold">Ecowitt snapshot trust examples</h3>
        <p className="text-xs text-muted-foreground">
          Operator-only sample rows. Nothing is written.
        </p>
      </header>
      <ul className="space-y-2">
        {SAMPLES.map((s) => {
          const view = classifySnapshotTrustBadge(s.input);
          return (
            <li
              key={s.key}
              data-testid={`ecowitt-trust-sample-${s.key}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/40 bg-secondary/20 p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{s.title}</p>
                <p className="text-[11px] text-muted-foreground">{s.body}</p>
              </div>
              <SnapshotTrustBadge view={view} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
