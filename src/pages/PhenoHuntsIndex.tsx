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
import { Loader2, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="max-w-3xl mx-auto p-4 space-y-4" data-testid="pheno-hunts-index">
      <header className="space-y-1">
        <h1 className="text-2xl font-display font-bold">Pheno Hunt</h1>
        <p className="text-sm text-muted-foreground">
          Track candidates, score phenotypes against your own targets, and preserve keepers — one
          hunt per grow.
        </p>
      </header>

      {status === "ready" && <PhenoStabilityDashboard model={stabilityModel} />}

      {status === "loading" ? (
        <div
          className="py-16 flex justify-center text-muted-foreground"
          data-testid="pheno-hunts-index-loading"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : status === "error" ? (
        <div className="glass rounded-2xl p-6 text-center" data-testid="pheno-hunts-index-error">
          <p className="text-sm text-muted-foreground">
            Your pheno hunts could not be loaded right now. Try again in a moment.
          </p>
        </div>
      ) : hunts.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center" data-testid="pheno-hunts-index-empty">
          <div className="mx-auto h-14 w-14 rounded-2xl glass flex items-center justify-center mb-3">
            <Sprout className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-display text-lg font-semibold">No pheno hunts yet</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
            A pheno hunt starts from a grow. Open a grow and use “Start Pheno Hunt” on its timeline
            to begin tracking candidates.
          </p>
          <Button asChild className="gradient-leaf text-primary-foreground">
            <Link to="/grows" data-testid="pheno-hunts-index-empty-cta">
              Go to My Grows
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-2" data-testid="pheno-hunts-index-list">
          {hunts.map((h) => (
            <li key={h.id}>
              <Link
                to={phenoHuntWorkspacePath(h.id)}
                data-testid={`pheno-hunts-index-item-${h.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-secondary/30 px-4 py-3 hover:bg-secondary/50 transition"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{h.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.candidateCount} {h.candidateCount === 1 ? "candidate" : "candidates"}
                    {h.setupCompletedAt ? "" : " · setup in progress"}
                    {formatCreated(h.createdAt) ? ` · started ${formatCreated(h.createdAt)}` : ""}
                  </p>
                </div>
                <span className="text-sm text-primary shrink-0">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
