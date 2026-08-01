/**
 * DashboardStartPhenoHuntCard — when the active/scoped grow has ≥2 eligible
 * plants, surface a Start Pheno Hunt CTA so the lab loop is one click away
 * after Start your room / create flows.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sprout } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useGrows } from "@/store/grows";
import { loadPhenoHuntCandidates } from "@/lib/phenoHuntCandidateLoader";
import {
  buildDashboardPhenoHuntCtaView,
  resolvePhenoHuntCtaGrowId,
} from "@/lib/dashboardPhenoHuntCtaRules";

interface Props {
  /** URL-scoped grow when Dashboard is filtered with ?growId= */
  scopedGrowId?: string | null;
  scopedGrowName?: string | null;
}

export default function DashboardStartPhenoHuntCard({
  scopedGrowId = null,
  scopedGrowName = null,
}: Props) {
  const { activeGrowId, activeGrow } = useGrows();
  const growId = resolvePhenoHuntCtaGrowId({ scopedGrowId, activeGrowId });
  const growName =
    (scopedGrowId && scopedGrowName) ||
    (growId && activeGrow?.id === growId ? activeGrow.name : null) ||
    scopedGrowName ||
    activeGrow?.name ||
    null;

  const [candidateCount, setCandidateCount] = useState(0);
  const [loading, setLoading] = useState(!!growId);

  useEffect(() => {
    let cancelled = false;
    if (!growId) {
      setCandidateCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadPhenoHuntCandidates({ growId }).then((res) => {
      if (cancelled) return;
      setCandidateCount(res.growScopeCandidateCount);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [growId]);

  const view = useMemo(
    () =>
      buildDashboardPhenoHuntCtaView({
        growId,
        growName,
        candidateCount,
        loading,
      }),
    [growId, growName, candidateCount, loading],
  );

  if (!view.visible || !view.href) return null;

  return (
    <div
      role="region"
      aria-labelledby="dashboard-start-pheno-hunt-title"
      data-testid="dashboard-start-pheno-hunt-card"
      className="rounded-2xl border border-primary/30 bg-primary/10 p-4 space-y-3"
    >
      <div className="flex items-start gap-2">
        <Sprout className="h-4 w-4 mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 space-y-1">
          <h2
            id="dashboard-start-pheno-hunt-title"
            className="text-sm font-semibold"
            data-testid="dashboard-start-pheno-hunt-title"
          >
            {view.title}
          </h2>
          <p
            className="text-xs text-muted-foreground leading-relaxed"
            data-testid="dashboard-start-pheno-hunt-description"
          >
            {view.description}
          </p>
          <p
            className="text-[11px] text-muted-foreground"
            data-testid="dashboard-start-pheno-hunt-count"
          >
            {view.candidateCount} candidates ready
          </p>
        </div>
      </div>
      <Button asChild size="sm" className="gap-1.5 gradient-leaf text-primary-foreground">
        <Link to={view.href} data-testid="dashboard-start-pheno-hunt-cta">
          <Sprout className="h-3.5 w-3.5" aria-hidden />
          {view.ctaLabel}
        </Link>
      </Button>
    </div>
  );
}
