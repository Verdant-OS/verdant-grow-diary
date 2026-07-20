/**
 * Canonical grower entry for AI Doctor.
 *
 * This page is navigation only. It never invokes a model, spends a credit,
 * persists a session, or selects a plant implicitly. The grower explicitly
 * chooses an active plant, then lands on the existing plant-scoped review.
 */
import { useMemo } from "react";
import { ArrowRight, History, Sprout, Stethoscope } from "lucide-react";
import { Link } from "react-router-dom";

import EmptyState from "@/components/EmptyState";
import GrowDataLoadError, { GrowDataLoadingState } from "@/components/GrowDataLoadError";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useGrowPlants } from "@/hooks/useGrowData";
import { buildAiDoctorEntryOptions } from "@/lib/aiDoctorEntryRules";
import { plantsPath } from "@/lib/routes";

export default function AiDoctorStart() {
  const plantsQuery = useGrowPlants();
  const options = useMemo(() => buildAiDoctorEntryOptions(plantsQuery.data), [plantsQuery.data]);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title="AI Doctor"
        description="Choose one plant so Verdant can keep its photos, diary, sensor context, and saved reviews together."
        icon={<Stethoscope className="h-5 w-5" aria-hidden="true" />}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/doctor/sessions" data-testid="ai-doctor-start-history-link">
              <History className="h-4 w-4" aria-hidden="true" />
              Saved reviews
            </Link>
          </Button>
        }
      />

      <section
        className="glass rounded-2xl p-4 sm:p-6"
        aria-labelledby="ai-doctor-start-plant-heading"
        data-testid="ai-doctor-start"
      >
        <div className="mb-4">
          <h2 id="ai-doctor-start-plant-heading" className="text-lg font-semibold">
            Choose a plant to review
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Verdant will not guess which plant you mean. Opening a plant prepares its existing
            context; AI Doctor runs only after you press the review button there.
          </p>
        </div>

        {plantsQuery.isLoading ? (
          <GrowDataLoadingState resource="Active plants" testId="ai-doctor-start-loading" />
        ) : plantsQuery.isError ? (
          <GrowDataLoadError
            resource="Active plants"
            testId="ai-doctor-start-error"
            message="We couldn't load your plants, so Verdant won't choose one from incomplete data. Try the read again."
            onRetry={() => void plantsQuery.refetch()}
          />
        ) : options.length === 0 ? (
          <EmptyState
            icon={<Sprout className="h-7 w-7" aria-hidden="true" />}
            title="No active plants to review"
            description="Create or reactivate a plant first. Archived and merged plants stay preserved in history but are not offered for a new review."
            action={
              <Button asChild>
                <Link to={plantsPath()} data-testid="ai-doctor-start-empty-plants-link">
                  Go to Plants
                </Link>
              </Button>
            }
            className="py-10"
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="ai-doctor-start-options">
            {options.map((option, index) => (
              <li key={option.id}>
                <Link
                  to={option.href}
                  className="group flex h-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/45 p-4 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`ai-doctor-start-option-${index}`}
                  aria-label={`Review ${option.name} with AI Doctor`}
                >
                  <span className="min-w-0">
                    <span className="block break-words font-semibold">{option.name}</span>
                    <span className="mt-1 block break-words text-xs text-muted-foreground">
                      {option.details ?? "Plant context available"}
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-3 text-xs text-muted-foreground" role="note">
        AI Doctor gives cautious guidance from available context. It never controls equipment, and
        any Action Queue suggestion remains approval-required.
      </p>
    </div>
  );
}
