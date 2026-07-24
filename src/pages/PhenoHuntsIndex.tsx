/**
 * PhenoHuntsIndex — the landing page for the Pheno Hunt nav tab.
 *
 * Lists the grower's own pheno hunts (RLS-scoped, newest first) with a
 * link into each hunt's workspace, plus an honest empty state. A hunt is
 * started from a grow's timeline (it needs a grow/tent context), so the
 * empty-state CTA routes to My Grows rather than a new-hunt wizard that
 * would dead-end without a grow.
 *
 * Read-only presenter. The route is wrapped in PhenoTrackerUpgradeGate at
 * the App.tsx level, so this component never re-checks entitlement.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowUpRight, Loader2, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/PageHeader";
import { listPhenoHuntsForOwner, type PhenoHuntListItem } from "@/lib/phenoHuntCandidatesService";
import { listKeeperStabilityForOwner, type KeeperStabilityRow } from "@/lib/phenoKeepersService";
import { buildStabilityDashboard } from "@/lib/phenoStabilityDashboardRules";
import PhenoStabilityDashboard from "@/components/PhenoStabilityDashboard";
import { phenoHuntWorkspacePath } from "@/lib/routes";

type Status = "loading" | "ready" | "error";

function formatCreated(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function PhenoHuntsIndex() {
  const [status, setStatus] = useState<Status>("loading");
  const [hunts, setHunts] = useState<PhenoHuntListItem[]>([]);
  const [keepers, setKeepers] = useState<KeeperStabilityRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    // Hunts drive the page's load status; the keeper roll-up is best-effort.
    // Hunt-list and candidate-count query failures reject so this page shows
    // an honest error state. A keeper-roll-up failure remains isolated because
    // it is optional context and must not hide an otherwise valid hunts list.
    Promise.all([listPhenoHuntsForOwner(), listKeeperStabilityForOwner().catch(() => [])])
      .then(([huntRows, keeperRows]) => {
        if (cancelled) return;
        setHunts(huntRows);
        setKeepers(keeperRows);
        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stabilityModel = useMemo(() => {
    const huntNameById: Record<string, string> = {};
    for (const h of hunts) huntNameById[h.id] = h.name;
    return buildStabilityDashboard(
      keepers.map((k) => ({
        keeperId: k.keeperId,
        keeperName: k.keeperName,
        huntId: k.huntId,
        stabilityRuns: k.stabilityRuns,
      })),
      huntNameById,
    );
  }, [hunts, keepers]);

  return (
    <div className="mx-auto min-w-0 max-w-4xl" data-testid="pheno-hunts-index">
      <PageHeader
        title="Pheno Hunts"
        eyebrow="Cultivar selection"
        description="Track candidates, score phenotypes against your own targets, and preserve keepers — one hunt per grow."
        icon={<Sprout className="size-5" />}
      />

      {status === "ready" && <PhenoStabilityDashboard model={stabilityModel} />}

      {status === "loading" ? (
        <div
          className="flex items-center justify-center rounded-3xl border border-border/60 bg-card/50 py-16 text-muted-foreground"
          data-testid="pheno-hunts-index-loading"
          role="status"
          aria-label="Loading pheno hunts"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : status === "error" ? (
        <div
          className="rounded-3xl border border-destructive/25 bg-card/65 p-6 text-center shadow-card backdrop-blur-xl sm:p-8"
          data-testid="pheno-hunts-index-error"
          role="alert"
        >
          <AlertCircle className="mx-auto mb-3 size-5 text-destructive" aria-hidden="true" />
          <p className="font-semibold text-foreground">Unable to load pheno hunts.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your pheno hunts could not be loaded right now. Try again in a moment.
          </p>
        </div>
      ) : hunts.length === 0 ? (
        <div
          className="rounded-3xl border border-dashed border-border/80 bg-card/50 px-5 py-10 text-center shadow-card sm:px-8"
          data-testid="pheno-hunts-index-empty"
        >
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Sprout className="size-6" aria-hidden="true" />
          </div>
          <h2 className="font-display text-lg font-semibold">No pheno hunts yet</h2>
          <p className="mx-auto mb-5 mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            A pheno hunt starts from a grow. Open a grow and use “Start Pheno Hunt” on its timeline
            to begin tracking candidates.
          </p>
          <Button asChild className="gradient-leaf text-primary-foreground">
            <Link to="/grows" data-testid="pheno-hunts-index-empty-cta">
              Go to My Grows
              <ArrowUpRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="pheno-hunts-index-list">
          {hunts.map((h) => (
            <li key={h.id}>
              <Link
                to={phenoHuntWorkspacePath(h.id)}
                data-testid={`pheno-hunts-index-item-${h.id}`}
                className="group flex h-full items-center justify-between gap-4 rounded-3xl border border-border/60 bg-card/65 p-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card hover:shadow-elevated sm:p-5"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-display font-semibold text-foreground">{h.name}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {h.candidateCount} {h.candidateCount === 1 ? "candidate" : "candidates"}
                    {h.setupCompletedAt ? "" : " · setup in progress"}
                    {formatCreated(h.createdAt) ? ` · started ${formatCreated(h.createdAt)}` : ""}
                  </p>
                </div>
                <ArrowUpRight
                  className="size-4 shrink-0 text-primary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
                <span className="sr-only">Open {h.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
