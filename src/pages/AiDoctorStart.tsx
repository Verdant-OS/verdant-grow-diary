/**
 * Canonical grower entry for AI Doctor.
 *
 * This page is navigation only. It never invokes a model, spends a credit,
 * persists a session, or selects a plant implicitly. The grower explicitly
 * chooses an active plant, then lands on the existing plant-scoped review.
 */
import { useMemo } from "react";
import { ArrowRight, History, Sprout, Stethoscope } from "lucide-react";
import { Link, useSearchParams } from "@/lib/react-router-compat";

import EmptyState from "@/components/EmptyState";
import GrowDataLoadError, { GrowDataLoadingState } from "@/components/GrowDataLoadError";
import OneTentLoopNextStepCard from "@/components/OneTentLoopNextStepCard";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { useGrowPlants, useGrowTents } from "@/hooks/useGrowData";
import { buildAiDoctorEntryOptions } from "@/lib/aiDoctorEntryRules";
import {
  partitionDoctorEntryOptionsByTent,
  resolveDoctorStartScope,
} from "@/lib/doctorStartContextRules";
import { plantsPath } from "@/lib/routes";
import { useGrows } from "@/store/grows";

export default function AiDoctorStart() {
  const plantsQuery = useGrowPlants();
  const options = useMemo(() => buildAiDoctorEntryOptions(plantsQuery.data), [plantsQuery.data]);

  // Back-half context carry (D-B6). The Sensors loop card can only ever emit
  // `{ growId, tentId }`, so that is all this page reads — and it validates
  // both against rows the grower owns before rendering anything. An id in a
  // URL is a request, not a grant.
  const [searchParams] = useSearchParams();
  const { grows, loading: growsLoading, error: growsError, refresh: refreshGrows } = useGrows();
  const tentsQuery = useGrowTents();

  // Ownership reads start EMPTY, not absent: `grows` is `[]` while loading and
  // `tentsQuery.data` is undefined. Resolving against them before they settle
  // would classify a perfectly valid carried scope as unowned and tell the
  // grower it "couldn't be matched to your account" — an unknown answer
  // presented as a negative one. Worse, a failed read would make that false
  // statement permanent. So scope messaging waits for both reads, and a read
  // FAILURE is reported as a failure to verify, never as invalid ownership.
  const requestedGrowId = (searchParams.get("growId") ?? "").trim();
  const requestedTentId = (searchParams.get("tentId") ?? "").trim();
  const scopeReadsSettled = !growsLoading && !tentsQuery.isLoading;
  // FAILING is narrower than SETTLING, and conflating them discarded verified
  // context. A read may only invalidate the scope it was needed to validate:
  // on a tent-only URL — supported, since a legacy tent may carry a null
  // grow_id — the grows read merely enriches the tent's owning grow, so its
  // failure must not throw away a tent `tentsQuery` confirmed the grower owns.
  const scopeReadFailed =
    (!!requestedGrowId && !!growsError) || (!!requestedTentId && tentsQuery.isError);
  // Neither read retries on its own: `useGrowTents` sets `retry: false` and
  // the grows store refreshes only on mount. Without an explicit affordance a
  // single transient failure would disable valid carried context for the whole
  // life of the page, and the grower's only recovery would be a full reload.
  // Retry only what actually failed — re-reading a healthy source is waste.
  const scopeRetrying = growsLoading || tentsQuery.isFetching;
  // Both scope messages used to end with "Every active plant is listed below."
  // unconditionally — but when the plants read fails (often the same outage
  // that broke the scope reads) the list is replaced by an error state, and
  // when there are no active plants it is replaced by an empty state. Stating
  // it anyway tells the grower something the page is visibly not doing.
  const plantsAreListed = !plantsQuery.isLoading && !plantsQuery.isError && options.length > 0;
  const everyPlantListedSuffix = plantsAreListed ? " Every active plant is listed below." : "";
  const retryScopeReads = () => {
    if (requestedGrowId && growsError) void refreshGrows();
    if (requestedTentId && tentsQuery.isError) void tentsQuery.refetch();
  };
  const carriedScopeRequested = !!requestedGrowId || !!requestedTentId;
  // Ordering and badges depend on the ownership reads. Rendering the list
  // before they settle shows the unscoped alphabetical order, then reorders
  // and re-badges under the grower's pointer — a link can move mid-click, and
  // a choice made in that window bypasses the carried context entirely.
  const scopeOrderingPending = carriedScopeRequested && !scopeReadsSettled;

  const scope = useMemo(
    () =>
      resolveDoctorStartScope({
        urlGrowId: searchParams.get("growId"),
        urlTentId: searchParams.get("tentId"),
        visibleGrows: grows,
        visibleTents: tentsQuery.data,
      }),
    [searchParams, grows, tentsQuery.data],
  );
  // Only trust a resolved scope once the rows it was checked against are real.
  const resolvedScope =
    scopeReadsSettled && !scopeReadFailed
      ? scope
      : { growId: null, growName: null, tentId: null, tentName: null, hasInvalidScope: false };

  // Carried tent scope reorders and labels the choices. It never removes one:
  // the explicit plant choice below is doctrine, and a shorter list is a
  // softer way of guessing.
  const partitioned = useMemo(
    () =>
      partitionDoctorEntryOptionsByTent({
        options,
        plants: plantsQuery.data,
        tentId: resolvedScope.tentId,
      }),
    [options, plantsQuery.data, resolvedScope.tentId],
  );
  const orderedOptions = useMemo(
    () => [...partitioned.inScope, ...partitioned.others],
    [partitioned],
  );
  const inScopeIds = useMemo(
    () => new Set(partitioned.inScope.map((option) => option.id)),
    [partitioned],
  );

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

      <OneTentLoopNextStepCard
        current="ai-doctor"
        ids={{ growId: resolvedScope.growId, tentId: resolvedScope.tentId }}
        testId="ai-doctor-start-one-tent-loop-next-step-card"
        className="mb-3"
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
          {resolvedScope.tentName ? (
            <p
              className="mt-2 text-sm text-muted-foreground"
              data-testid="ai-doctor-start-tent-context"
            >
              This link carried tent context:{" "}
              <span className="font-medium text-foreground">{resolvedScope.tentName}</span>.
              {plantsAreListed
                ? " Its plants are listed first — you can still choose any plant."
                : ""}
            </p>
          ) : null}
          {scopeReadFailed && carriedScopeRequested ? (
            <p
              className="mt-2 text-sm text-muted-foreground"
              data-testid="ai-doctor-start-scope-unverified"
            >
              Verdant couldn&apos;t check the grow or tent this link carried, so no tent context is
              applied.{everyPlantListedSuffix}{" "}
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-sm align-baseline"
                onClick={retryScopeReads}
                disabled={scopeRetrying}
                data-testid="ai-doctor-start-scope-retry"
              >
                {scopeRetrying ? "Checking…" : "Try the check again"}
              </Button>
            </p>
          ) : null}
          {resolvedScope.hasInvalidScope ? (
            <p
              className="mt-2 text-sm text-muted-foreground"
              data-testid="ai-doctor-start-invalid-scope"
            >
              That link carried a grow or tent Verdant couldn't match to your account, so no tent
              context is applied.{everyPlantListedSuffix}
            </p>
          ) : null}
        </div>

        {plantsQuery.isLoading || scopeOrderingPending ? (
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
            {orderedOptions.map((option, index) => (
              <li key={option.id}>
                <Link
                  to={option.href}
                  className="group flex h-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/45 p-4 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid={`ai-doctor-start-option-${index}`}
                  aria-label={`Review ${option.name} with AI Doctor`}
                  // The explicit aria-label replaces ALL descendant text in the
                  // accessible name, so the "In this tent" badge below would be
                  // silent to screen readers. Expose it as the DESCRIPTION
                  // instead: same scope cue, action name unchanged.
                  aria-describedby={
                    inScopeIds.has(option.id)
                      ? `ai-doctor-start-option-${index}-in-tent`
                      : undefined
                  }
                >
                  <span className="min-w-0">
                    <span className="block break-words font-semibold">{option.name}</span>
                    {inScopeIds.has(option.id) ? (
                      <span
                        className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                        id={`ai-doctor-start-option-${index}-in-tent`}
                        data-testid={`ai-doctor-start-option-${index}-in-tent`}
                      >
                        In this tent
                      </span>
                    ) : null}
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
